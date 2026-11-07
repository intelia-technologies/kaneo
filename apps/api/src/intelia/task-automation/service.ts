import { desc, eq, getTableColumns, max, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable, userTable } from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import {
  type AutomationLevel,
  type AutomationSource,
  type DeliveryKind,
  taskAutomationChangeTable,
  taskAutomationTable,
} from "../schema";
import { notifyAutomationChanged } from "./event";
import { COMPLETA_NEEDS_VERIFICATION, PAUSE_NEEDS_MANUAL } from "./schema";

/**
 * A task's automation (design 48 §3.2). `level` is the former value, kept for
 * the old engine until the cut and tied to `automatica`.
 */
export type AutomationValue = {
  level: AutomationLevel;
  verification: boolean;
  automatica: boolean;
  pausaMotivo: string | null;
  entrega: DeliveryKind | null;
  responsable: string | null;
  implementador: string | null;
  verificador: string | null;
  columnaPrevia: string | null;
};

/** A write: any subset; omitted fields stay, null clears an optional one. */
export type AutomationPatch = Partial<AutomationValue>;

// The fields that make a change: logged, signed and sent as
// `task.automation_changed`. The roles and `columnaPrevia` are the
// dispatcher's bookkeeping: stored as they come, without a log row or event.
const LOGGED_FIELDS = [
  "level",
  "verification",
  "automatica",
  "pausaMotivo",
  "entrega",
] as const satisfies readonly (keyof AutomationValue)[];
const BOOKKEEPING_FIELDS = [
  "responsable",
  "implementador",
  "verificador",
  "columnaPrevia",
] as const satisfies readonly (keyof AutomationValue)[];

function invalid(path: string, message: string) {
  return new ApiError(400, {
    message,
    code: "VALIDATION_ERROR",
    issues: [{ path: `body.${path}`, message }],
  });
}

/**
 * The value a patch leaves, from the stored one (null the first time, when it
 * must bring the verification and `automatica` or `level`):
 * - `automatica` comes from the patch, else from its `level`, else stays;
 * - without `level`, no is `manual` and yes keeps `arranque` or `completa`
 *   (`completa` only while verified), else `arranque`;
 * - `pausaMotivo` only with `automatica` off: it clears when `automatica`
 *   changes, unless the patch brings one.
 */
export function resolveAutomation(
  current: AutomationValue | null,
  patch: AutomationPatch,
): AutomationValue {
  const automatica =
    patch.automatica ??
    (patch.level === undefined
      ? current?.automatica
      : patch.level !== "manual");
  const verification = patch.verification ?? current?.verification;
  if (automatica === undefined) {
    throw invalid("automatica", "`automatica` or `level` is required");
  }
  if (verification === undefined) {
    throw invalid("verification", "`verification` is required");
  }
  let level = patch.level;
  if (level === undefined) {
    const automatic =
      current && current.level !== "manual" ? current.level : null;
    level = !automatica
      ? "manual"
      : automatic === "completa" && !verification
        ? "arranque"
        : (automatic ?? "arranque");
  } else if (level === "completa" && !verification) {
    throw invalid("verification", COMPLETA_NEEDS_VERIFICATION);
  }
  const pausaMotivo =
    patch.pausaMotivo !== undefined
      ? patch.pausaMotivo
      : automatica || automatica !== current?.automatica
        ? null
        : current.pausaMotivo;
  if (automatica && pausaMotivo !== null) {
    throw invalid("pausaMotivo", PAUSE_NEEDS_MANUAL);
  }
  const kept = (field: (typeof BOOKKEEPING_FIELDS)[number] | "entrega") =>
    patch[field] !== undefined ? patch[field] : (current?.[field] ?? null);
  return {
    level,
    verification,
    automatica,
    pausaMotivo,
    entrega: kept("entrega") as DeliveryKind | null,
    responsable: kept("responsable"),
    implementador: kept("implementador"),
    verificador: kept("verificador"),
    columnaPrevia: kept("columnaPrevia"),
  };
}

/** The stored value of a `task_automation` row. */
export function automationValueOf(row: AutomationValue): AutomationValue {
  return {
    level: row.level,
    verification: row.verification,
    automatica: row.automatica,
    pausaMotivo: row.pausaMotivo,
    entrega: row.entrega,
    responsable: row.responsable,
    implementador: row.implementador,
    verificador: row.verificador,
    columnaPrevia: row.columnaPrevia,
  };
}

/**
 * Who writes the level: a person's session, an account's API key (with the
 * actor its caller declares, if any), or the migration rule (no user) for a
 * level nobody chose.
 */
export type AutomationWriter =
  | { source: "session"; userId: string }
  | { source: "api_key"; userId: string; actor: string | null }
  | { source: "migration" };

/** A stored writer: the columns of `task_automation` that name who set it. */
export type AutomationAuthor = {
  source: AutomationSource;
  userId: string | null;
  actor: string | null;
};

function authorOf(writer: AutomationWriter): AutomationAuthor {
  if (writer.source === "migration") {
    return { source: "migration", userId: null, actor: null };
  }
  return {
    source: writer.source,
    userId: writer.userId,
    actor: writer.source === "api_key" ? writer.actor : null,
  };
}

/** A write and who makes it (at creation, the task's creator). */
export type AutomationChange = {
  value: AutomationPatch;
  writer: AutomationWriter;
};

/** The value before (null the first time) and after, and when it was logged. */
export type LoggedWrite = {
  previous: AutomationValue | null;
  value: AutomationValue;
  changedAt: Date;
};

/** A change written to the log, with who wrote it. */
export type LoggedChange = LoggedWrite & { writer: AutomationWriter };

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
 * Writes the automation and its change-log row inside the caller's
 * transaction: upstream's task creation calls it before committing the task,
 * so the task, its automation and the first log row commit or roll back
 * together. The patch is resolved against the stored value
 * (`resolveAutomation`; a 400 rolls the caller back). A write that leaves the
 * logged fields as they were is not a change: nothing is logged, the author
 * stays and it returns null; new bookkeeping (roles, `columnaPrevia`) is still
 * stored. Otherwise it returns the logged change.
 */
export async function writeAutomation(
  tx: Transaction,
  taskId: string,
  { value, writer }: AutomationChange,
): Promise<LoggedChange | null> {
  const logged = await writeAutomationAs(tx, taskId, value, authorOf(writer));
  return logged && { ...logged, writer };
}

/** `writeAutomation` for an author read back from a stored level. */
export async function writeAutomationAs(
  tx: Transaction,
  taskId: string,
  patch: AutomationPatch,
  { source, userId, actor }: AutomationAuthor,
): Promise<LoggedWrite | null> {
  const [stored] = await tx
    .select()
    .from(taskAutomationTable)
    .where(eq(taskAutomationTable.taskId, taskId))
    .limit(1);
  const current = stored ? automationValueOf(stored) : null;
  const value = resolveAutomation(current, patch);
  if (current && LOGGED_FIELDS.every((f) => current[f] === value[f])) {
    if (BOOKKEEPING_FIELDS.some((f) => current[f] !== value[f])) {
      const bookkeeping = Object.fromEntries(
        BOOKKEEPING_FIELDS.map((f) => [f, value[f]]),
      );
      await tx
        .update(taskAutomationTable)
        .set(bookkeeping)
        .where(eq(taskAutomationTable.taskId, taskId));
    }
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
    ...value,
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
    previousAutomatica: current?.automatica ?? null,
    level: value.level,
    verification: value.verification,
    automatica: value.automatica,
    pausaMotivo: value.pausaMotivo,
    entrega: value.entrega,
    changedByUserId: userId,
    changedByActor: actor,
    source,
    changedAt: now,
  });
  return { previous: current, value, changedAt: now };
}

/**
 * Changes an existing task's automation (PUT …/automation), resolving the
 * patch under the task's lock. A real change goes out as
 * `task.automation_changed` once committed; creating a task does not call
 * this, so it never sends that event.
 */
export async function setAutomation(
  taskId: string,
  patch: AutomationPatch,
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
    const logged = await writeAutomation(tx, taskId, { value: patch, writer });
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
