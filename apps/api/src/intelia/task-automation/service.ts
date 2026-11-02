import { desc, eq, getTableColumns, max, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable, userTable } from "../../database/schema";
import {
  type AutomationLevel,
  type AutomationSource,
  taskAutomationChangeTable,
  taskAutomationTable,
} from "../schema";
import { notifyAutomationChanged } from "./event";

export type AutomationValue = {
  level: AutomationLevel;
  verification: boolean;
};

/** Who writes the level: a Kaneo user, or the gateway acting for a graph id. */
export type AutomationWriter =
  | { source: "session" | "api_key"; userId: string }
  | { source: "gateway"; actor: string };

/** A level and who writes it (at creation, the task's creator). */
export type AutomationChange = {
  value: AutomationValue;
  writer: AutomationWriter;
};

/** A change written to the log: the value before (null the first time) and after. */
export type LoggedChange = {
  previous: AutomationValue | null;
  value: AutomationValue;
  writer: AutomationWriter;
  changedAt: Date;
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const setBy = alias(userTable, "automation_set_by");
const changedBy = alias(userTable, "automation_changed_by");

const automationColumns = {
  ...getTableColumns(taskAutomationTable),
  setByName: setBy.name,
};

function selectAutomation() {
  return db
    .select(automationColumns)
    .from(taskAutomationTable)
    .leftJoin(setBy, eq(taskAutomationTable.setByUserId, setBy.id));
}

export async function getAutomation(taskId: string) {
  const [automation] = await selectAutomation()
    .where(eq(taskAutomationTable.taskId, taskId))
    .limit(1);
  if (!automation) {
    throw new HTTPException(404, { message: "Automation level not set" });
  }
  return automation;
}

export function listProjectAutomation(projectId: string) {
  return selectAutomation()
    .innerJoin(taskTable, eq(taskAutomationTable.taskId, taskTable.id))
    .where(eq(taskTable.projectId, projectId))
    .orderBy(taskTable.number, taskTable.id);
}

/**
 * Writes the level and its change-log row inside the caller's transaction:
 * upstream's task creation calls it before committing the task, so the task,
 * its level and the first log row commit or roll back together. Writes of the
 * same value are not changes: nothing is logged, the stored row (with its
 * author) stays and it returns null. Otherwise it returns the logged change.
 */
export async function writeAutomation(
  tx: Transaction,
  taskId: string,
  { value, writer }: AutomationChange,
): Promise<LoggedChange | null> {
  const userId = writer.source === "gateway" ? null : writer.userId;
  const actor = writer.source === "gateway" ? writer.actor : null;
  const source: AutomationSource = writer.source;

  const [current] = await tx
    .select()
    .from(taskAutomationTable)
    .where(eq(taskAutomationTable.taskId, taskId))
    .limit(1);
  if (
    current?.level === value.level &&
    current.verification === value.verification
  ) {
    return null;
  }

  // Strictly increasing per task, so the log and task.automation_changed
  // order by it even with two changes in the same millisecond or a clock that
  // goes back: at most a few milliseconds ahead of the clock. Safe because
  // writers of a task are serialized (the advisory lock in setAutomation; at
  // creation, the task is not visible to anyone else yet).
  const [{ last } = { last: null }] = await tx
    .select({ last: max(taskAutomationChangeTable.changedAt) })
    .from(taskAutomationChangeTable)
    .where(eq(taskAutomationChangeTable.taskId, taskId));
  const now = new Date(
    Math.max(Date.now(), last ? last.getTime() + 1 : Number.NEGATIVE_INFINITY),
  );
  const row = {
    level: value.level,
    verification: value.verification,
    setByUserId: userId,
    setByActor: actor,
    source,
    setAt: now,
  };
  await tx
    .insert(taskAutomationTable)
    .values({ taskId, ...row })
    .onConflictDoUpdate({ target: taskAutomationTable.taskId, set: row });
  await tx.insert(taskAutomationChangeTable).values({
    taskId,
    previousLevel: current?.level ?? null,
    previousVerification: current?.verification ?? null,
    level: value.level,
    verification: value.verification,
    changedByUserId: userId,
    changedByActor: actor,
    source,
    changedAt: now,
  });
  return {
    previous: current
      ? { level: current.level, verification: current.verification }
      : null,
    value,
    writer,
    changedAt: now,
  };
}

/**
 * Changes an existing task's level (PUT …/automation). A real change goes out
 * as `task.automation_changed` once committed; creating a task does not call
 * this, so it never sends that event.
 */
export async function setAutomation(
  taskId: string,
  value: AutomationValue,
  writer: AutomationWriter,
) {
  const change = await db.transaction(async (tx) => {
    // One writer per task at a time, without locking upstream's task row.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`intelia.task_automation:${taskId}`}))`,
    );
    const [task] = await tx
      .select({ id: taskTable.id, projectId: taskTable.projectId })
      .from(taskTable)
      .where(eq(taskTable.id, taskId))
      .limit(1);
    if (!task) throw new HTTPException(404, { message: "Task not found" });
    const logged = await writeAutomation(tx, taskId, { value, writer });
    return logged && { ...logged, projectId: task.projectId };
  });

  // Like upstream's events, delivery does not hold the response, and a failed
  // delivery does not undo the change.
  if (change) {
    void notifyAutomationChanged(taskId, change).catch((error) =>
      console.error("task.automation_changed delivery failed", {
        error: error instanceof Error ? error.message : String(error),
        taskId,
      }),
    );
  }

  return getAutomation(taskId);
}

export async function listAutomationChanges(taskId: string, limit: number) {
  const [task] = await db
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);
  if (!task) throw new HTTPException(404, { message: "Task not found" });
  return db
    .select({
      ...getTableColumns(taskAutomationChangeTable),
      changedByName: changedBy.name,
    })
    .from(taskAutomationChangeTable)
    .leftJoin(
      changedBy,
      eq(taskAutomationChangeTable.changedByUserId, changedBy.id),
    )
    .where(eq(taskAutomationChangeTable.taskId, taskId))
    .orderBy(
      desc(taskAutomationChangeTable.changedAt),
      desc(taskAutomationChangeTable.id),
    )
    .limit(limit);
}
