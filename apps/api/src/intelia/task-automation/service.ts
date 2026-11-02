import { desc, eq, getTableColumns, sql } from "drizzle-orm";
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

export type AutomationValue = {
  level: AutomationLevel;
  verification: boolean;
};

/**
 * Who writes the level: a Kaneo user, the gateway acting for a graph id, or
 * the migration rule (no user) for a level nobody chose.
 */
export type AutomationWriter =
  | { source: "session" | "api_key"; userId: string }
  | { source: "gateway"; actor: string }
  | { source: "migration" };

/** A stored writer: the columns of `task_automation` that name who set it. */
export type AutomationAuthor = {
  source: AutomationSource;
  userId: string | null;
  actor: string | null;
};

function authorOf(writer: AutomationWriter): AutomationAuthor {
  if (writer.source === "gateway") {
    return { source: "gateway", userId: null, actor: writer.actor };
  }
  if (writer.source === "migration") {
    return { source: "migration", userId: null, actor: null };
  }
  return { source: writer.source, userId: writer.userId, actor: null };
}

/** A level and who writes it (at creation, the task's creator). */
export type AutomationChange = {
  value: AutomationValue;
  writer: AutomationWriter;
};

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
 * same value are not changes: nothing is logged and the stored row (with its
 * author) stays.
 */
export function writeAutomation(
  tx: Transaction,
  taskId: string,
  { value, writer }: AutomationChange,
) {
  return writeAutomationAs(tx, taskId, value, authorOf(writer));
}

/** `writeAutomation` for an author read back from a stored level. */
export async function writeAutomationAs(
  tx: Transaction,
  taskId: string,
  value: AutomationValue,
  { source, userId, actor }: AutomationAuthor,
) {
  const [current] = await tx
    .select()
    .from(taskAutomationTable)
    .where(eq(taskAutomationTable.taskId, taskId))
    .limit(1);
  if (
    current?.level === value.level &&
    current.verification === value.verification
  ) {
    return;
  }

  const now = new Date();
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
}

/** Changes an existing task's level (PUT …/automation). */
export async function setAutomation(
  taskId: string,
  value: AutomationValue,
  writer: AutomationWriter,
) {
  await db.transaction(async (tx) => {
    // One writer per task at a time, without locking upstream's task row.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`intelia.task_automation:${taskId}`}))`,
    );
    const [task] = await tx
      .select({ id: taskTable.id })
      .from(taskTable)
      .where(eq(taskTable.id, taskId))
      .limit(1);
    if (!task) throw new HTTPException(404, { message: "Task not found" });
    await writeAutomation(tx, taskId, { value, writer });
  });

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
