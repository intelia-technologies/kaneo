import { and, desc, eq, getTableColumns, max } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable, userTable } from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import {
  type InitiativeChangeKind,
  type InitiativeChangeSource,
  initiativeChangeTable,
  initiativeTable,
  type TaskInitiativeChangeSource,
  type TaskOrigin,
  taskInitiativeChangeTable,
  taskInitiativeTable,
} from "../schema";
import type { Transaction } from "../task-automation/service";
import type { InitiativeWriter } from "./access";
import type { InitiativeOnCreate } from "./schema";

// The column whose first task closes the plan (design 19 §4).
export const START_STATUS = "in-progress";

// Name of the initiative that INTELIA_TASK_INITIATIVE_OPTIONAL gives to tasks
// created without one (upstream's tests and smoke only).
export const TEST_INITIATIVE_NAME = "Pruebas de upstream";

/** The name as the uniqueness rule sees it: no case, accents or extra spaces. */
export function initiativeNameKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

type Author = {
  userId: string | null;
  actor: string | null;
};

function authorOf(writer: InitiativeWriter): Author {
  return {
    userId: writer.userId,
    actor: writer.source === "api_key" ? writer.actor : null,
  };
}

// Strictly increasing per entity, so each change log orders by its timestamp
// even with two writes in the same millisecond or a clock that goes back.
// Safe because writers of the same entity hold its row lock.
function after(last: Date | null) {
  return new Date(
    Math.max(Date.now(), last ? last.getTime() + 1 : Number.NEGATIVE_INFINITY),
  );
}

async function nextInitiativeChangeAt(tx: Transaction, initiativeId: string) {
  const [row] = await tx
    .select({ last: max(initiativeChangeTable.changedAt) })
    .from(initiativeChangeTable)
    .where(eq(initiativeChangeTable.initiativeId, initiativeId));
  return after(row?.last ?? null);
}

async function nextTaskChangeAt(tx: Transaction, taskId: string) {
  const [row] = await tx
    .select({ last: max(taskInitiativeChangeTable.changedAt) })
    .from(taskInitiativeChangeTable)
    .where(eq(taskInitiativeChangeTable.taskId, taskId));
  return after(row?.last ?? null);
}

function isUniqueViolation(error: unknown): boolean {
  for (let e = error; e && typeof e === "object";) {
    if ("code" in e && e.code === "23505") return true;
    e = "cause" in e ? e.cause : undefined;
  }
  return false;
}

function nameTaken(): ApiError {
  return new ApiError(409, {
    message:
      "The project already has an initiative with that name (ignoring case, accents and spaces)",
    code: "INITIATIVE_NAME_TAKEN",
  });
}

const createdBy = alias(userTable, "initiative_created_by");
const changedBy = alias(userTable, "initiative_changed_by");
const setBy = alias(userTable, "task_initiative_set_by");

const initiativeColumns = {
  id: initiativeTable.id,
  projectId: initiativeTable.projectId,
  name: initiativeTable.name,
  designUrl: initiativeTable.designUrl,
  approvedBy: initiativeTable.approvedBy,
  approvedAt: initiativeTable.approvedAt,
  createdByUserId: initiativeTable.createdByUserId,
  createdByActor: initiativeTable.createdByActor,
  source: initiativeTable.source,
  createdAt: initiativeTable.createdAt,
  planClosedAt: initiativeTable.planClosedAt,
};

export async function getInitiative(initiativeId: string) {
  const [initiative] = await db
    .select({ ...initiativeColumns, createdByName: createdBy.name })
    .from(initiativeTable)
    .leftJoin(createdBy, eq(initiativeTable.createdByUserId, createdBy.id))
    .where(eq(initiativeTable.id, initiativeId))
    .limit(1);
  if (!initiative)
    throw new HTTPException(404, { message: "Initiative not found" });
  return initiative;
}

// Locks the initiative row for the rest of the transaction: plan closing and
// assigning tasks serialize on it, so an origin never races a closing.
async function lockInitiative(tx: Transaction, initiativeId: string) {
  const [initiative] = await tx
    .select()
    .from(initiativeTable)
    .where(eq(initiativeTable.id, initiativeId))
    .limit(1)
    .for("update");
  return initiative ?? null;
}

async function logInitiativeChange(
  tx: Transaction,
  initiativeId: string,
  change: {
    kind: InitiativeChangeKind;
    previous: Record<string, unknown> | null;
    value: Record<string, unknown>;
    source: InitiativeChangeSource;
    author: Author;
    taskId?: string | null;
    at?: Date;
  },
) {
  const changedAt =
    change.at ?? (await nextInitiativeChangeAt(tx, initiativeId));
  await tx.insert(initiativeChangeTable).values({
    initiativeId,
    kind: change.kind,
    previous: change.previous,
    value: change.value,
    taskId: change.taskId ?? null,
    changedByUserId: change.author.userId,
    changedByActor: change.author.actor,
    source: change.source,
    changedAt,
  });
  return changedAt;
}

type InitiativeData = {
  name?: string;
  designUrl?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
};

function dataValue(row: {
  name: string;
  designUrl: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
}) {
  return {
    name: row.name,
    designUrl: row.designUrl,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
  };
}

export async function createInitiative(
  projectId: string,
  data: InitiativeData & { name: string },
  writer: InitiativeWriter,
) {
  const author = authorOf(writer);
  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(initiativeTable)
      .values({
        projectId,
        name: data.name,
        nameKey: initiativeNameKey(data.name),
        designUrl: data.designUrl ?? null,
        approvedBy: data.approvedBy ?? null,
        approvedAt: data.approvedAt ? new Date(data.approvedAt) : null,
        createdByUserId: author.userId,
        createdByActor: author.actor,
        source: writer.source,
      })
      .onConflictDoNothing({
        target: [initiativeTable.projectId, initiativeTable.nameKey],
      })
      .returning();
    if (!created) throw nameTaken();
    await logInitiativeChange(tx, created.id, {
      kind: "created",
      previous: null,
      value: dataValue(created),
      source: writer.source,
      author,
      at: created.createdAt,
    });
    return created.id;
  });
  return getInitiative(id);
}

export async function updateInitiative(
  initiativeId: string,
  data: InitiativeData,
  writer: InitiativeWriter,
) {
  try {
    await db.transaction(async (tx) => {
      const current = await lockInitiative(tx, initiativeId);
      if (!current) {
        throw new HTTPException(404, { message: "Initiative not found" });
      }
      const before = dataValue(current);
      const next = {
        name: data.name ?? before.name,
        designUrl:
          data.designUrl === undefined ? before.designUrl : data.designUrl,
        approvedBy:
          data.approvedBy === undefined ? before.approvedBy : data.approvedBy,
        approvedAt:
          data.approvedAt === undefined
            ? before.approvedAt
            : data.approvedAt === null
              ? null
              : new Date(data.approvedAt).toISOString(),
      };
      const previous: Record<string, unknown> = {};
      const value: Record<string, unknown> = {};
      for (const key of Object.keys(next) as (keyof typeof next)[]) {
        if (next[key] !== before[key]) {
          previous[key] = before[key];
          value[key] = next[key];
        }
      }
      if (Object.keys(value).length === 0) return;
      await tx
        .update(initiativeTable)
        .set({
          name: next.name,
          nameKey: initiativeNameKey(next.name),
          designUrl: next.designUrl,
          approvedBy: next.approvedBy,
          approvedAt: next.approvedAt ? new Date(next.approvedAt) : null,
        })
        .where(eq(initiativeTable.id, initiativeId));
      await logInitiativeChange(tx, initiativeId, {
        kind: "updated",
        previous,
        value,
        source: writer.source,
        author: authorOf(writer),
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
  return getInitiative(initiativeId);
}

// Closes the plan of a locked, open initiative.
async function closeLockedPlan(
  tx: Transaction,
  initiativeId: string,
  source: InitiativeChangeSource,
  author: Author,
  taskId: string | null,
) {
  const at = await nextInitiativeChangeAt(tx, initiativeId);
  await tx
    .update(initiativeTable)
    .set({ planClosedAt: at })
    .where(eq(initiativeTable.id, initiativeId));
  await logInitiativeChange(tx, initiativeId, {
    kind: "plan_closed",
    previous: { planClosedAt: null },
    value: { planClosedAt: at.toISOString() },
    source,
    author,
    taskId,
    at,
  });
  return at;
}

/** Closes the plan by hand. Closing a closed plan changes nothing. */
export async function closePlan(
  initiativeId: string,
  writer: InitiativeWriter,
) {
  await db.transaction(async (tx) => {
    const current = await lockInitiative(tx, initiativeId);
    if (!current)
      throw new HTTPException(404, { message: "Initiative not found" });
    if (current.planClosedAt) return;
    await closeLockedPlan(
      tx,
      initiativeId,
      writer.source,
      authorOf(writer),
      null,
    );
  });
  return getInitiative(initiativeId);
}

const NO_AUTHOR: Author = { userId: null, actor: null };

// The automatic close when a task reaches In progress runs in the database,
// inside the transaction that changes the task's status: the trigger
// `intelia_close_plan_on_start` (../task-hooks.ts), for every path that writes
// `task.status` (API, bulk, reorder, integrations, routines). It takes the
// initiative's row lock like the code here, so an assignment never races it.

type MembershipWrite = {
  source: TaskInitiativeChangeSource & ("session" | "api_key" | "migration");
  author: Author;
};

function membershipWrite(writer: InitiativeWriter): MembershipWrite {
  return { source: writer.source, author: authorOf(writer) };
}

/**
 * Puts a task in an initiative of its project inside the caller's
 * transaction, with the origin the plan gives it now: `plan` while open,
 * `añadido` once closed (design 19 §4). Moving it to the initiative it is
 * already in changes nothing and returns null.
 */
export async function assignTaskInitiative(
  tx: Transaction,
  task: { id: string; projectId: string; status: string },
  initiativeId: string,
  write: MembershipWrite,
): Promise<{ origin: TaskOrigin } | null> {
  const initiative = await lockInitiative(tx, initiativeId);
  if (!initiative) {
    throw new ApiError(400, {
      message: "Initiative not found",
      code: "INITIATIVE_NOT_FOUND",
    });
  }
  if (initiative.projectId !== task.projectId) {
    throw new ApiError(400, {
      message: "The initiative belongs to another project",
      code: "INITIATIVE_NOT_IN_PROJECT",
    });
  }
  const [current] = await tx
    .select()
    .from(taskInitiativeTable)
    .where(eq(taskInitiativeTable.taskId, task.id))
    .limit(1);
  if (current?.initiativeId === initiativeId) return null;

  const origin: TaskOrigin = initiative.planClosedAt ? "añadido" : "plan";
  const since = await nextTaskChangeAt(tx, task.id);
  const row = {
    initiativeId,
    origin,
    since,
    setByUserId: write.author.userId,
    setByActor: write.author.actor,
    source: write.source,
  };
  await tx
    .insert(taskInitiativeTable)
    .values({ taskId: task.id, ...row })
    .onConflictDoUpdate({ target: taskInitiativeTable.taskId, set: row });
  await tx.insert(taskInitiativeChangeTable).values({
    taskId: task.id,
    previousInitiativeId: current?.initiativeId ?? null,
    previousOrigin: current?.origin ?? null,
    initiativeId,
    origin,
    changedByUserId: write.author.userId,
    changedByActor: write.author.actor,
    source: write.source,
    changedAt: since,
  });
  // A task that is itself in In progress closes the plan it joins (the
  // trigger cannot: the task had no initiative when its status was written).
  if (!initiative.planClosedAt && task.status === START_STATUS) {
    await closeLockedPlan(tx, initiativeId, "auto", NO_AUTHOR, task.id);
  }
  return { origin };
}

/**
 * The initiative a task being created asks for: its own, or its parent's. The
 * parent is looked up in the new task's project only, so a task of another
 * project answers the same as one that does not exist.
 */
export async function resolveInitiativeOnCreate(
  projectId: string,
  input: InitiativeOnCreate,
): Promise<string> {
  if ("id" in input) return input.id;
  const [parent] = await db
    .select({
      id: taskTable.id,
      initiativeId: taskInitiativeTable.initiativeId,
    })
    .from(taskTable)
    .leftJoin(taskInitiativeTable, eq(taskInitiativeTable.taskId, taskTable.id))
    .where(
      and(
        eq(taskTable.id, input.parentTaskId),
        eq(taskTable.projectId, projectId),
      ),
    )
    .limit(1);
  if (!parent) {
    throw new ApiError(400, {
      message: "Parent task not found in this project",
      code: "PARENT_TASK_NOT_FOUND",
    });
  }
  if (!parent.initiativeId) {
    throw new ApiError(400, {
      message: "The parent task has no initiative; send `initiative.id`",
      code: "PARENT_WITHOUT_INITIATIVE",
    });
  }
  return parent.initiativeId;
}

/** The initiative of a task, or null. */
export async function taskInitiativeId(
  executor: typeof db | Transaction,
  taskId: string,
) {
  const [row] = await executor
    .select({ initiativeId: taskInitiativeTable.initiativeId })
    .from(taskInitiativeTable)
    .where(eq(taskInitiativeTable.taskId, taskId))
    .limit(1);
  return row?.initiativeId ?? null;
}

/**
 * A task that leaves its project loses its initiative (an initiative belongs
 * to one project, design 19 decision 6), with a row in the log.
 */
export async function dropTaskInitiativeOnProjectMove(
  tx: Transaction,
  taskId: string,
  userId: string,
) {
  const [current] = await tx
    .delete(taskInitiativeTable)
    .where(eq(taskInitiativeTable.taskId, taskId))
    .returning();
  if (!current) return;
  await tx.insert(taskInitiativeChangeTable).values({
    taskId,
    previousInitiativeId: current.initiativeId,
    previousOrigin: current.origin,
    initiativeId: null,
    origin: null,
    changedByUserId: userId,
    changedByActor: null,
    source: "project_move",
    changedAt: await nextTaskChangeAt(tx, taskId),
  });
}

/** PUT …/task/{taskId}/initiative: puts the task in another initiative. */
export async function setTaskInitiative(
  taskId: string,
  initiativeId: string,
  writer: InitiativeWriter,
) {
  await db.transaction(async (tx) => {
    // The task's row lock, the one a move to another project takes when it
    // updates the row: the project read here cannot go stale before commit.
    const [task] = await tx
      .select({
        id: taskTable.id,
        projectId: taskTable.projectId,
        status: taskTable.status,
      })
      .from(taskTable)
      .where(eq(taskTable.id, taskId))
      .limit(1)
      .for("update");
    if (!task) throw new HTTPException(404, { message: "Task not found" });
    await assignTaskInitiative(tx, task, initiativeId, membershipWrite(writer));
  });
  return getTaskInitiative(taskId);
}

/** Puts a just-created task in its initiative, signed by its creator. */
export function assignOnCreate(
  tx: Transaction,
  task: { id: string; projectId: string; status: string },
  initiativeId: string,
  writer: InitiativeWriter,
) {
  return assignTaskInitiative(tx, task, initiativeId, membershipWrite(writer));
}

/**
 * The initiative of a recurrence occurrence: its template's, signed as the
 * template's membership was. A template without initiative gives none.
 */
export async function assignOccurrence(
  tx: Transaction,
  templateTaskId: string,
  task: { id: string; projectId: string; status: string },
) {
  const [template] = await tx
    .select()
    .from(taskInitiativeTable)
    .where(eq(taskInitiativeTable.taskId, templateTaskId))
    .limit(1);
  if (!template) return null;
  return assignTaskInitiative(tx, task, template.initiativeId, {
    source: template.source,
    author: { userId: template.setByUserId, actor: template.setByActor },
  });
}

export async function getTaskInitiative(taskId: string) {
  const [membership] = await db
    .select({
      ...getTableColumns(taskInitiativeTable),
      initiativeName: initiativeTable.name,
      setByName: setBy.name,
    })
    .from(taskInitiativeTable)
    .innerJoin(
      initiativeTable,
      eq(taskInitiativeTable.initiativeId, initiativeTable.id),
    )
    .leftJoin(setBy, eq(taskInitiativeTable.setByUserId, setBy.id))
    .where(eq(taskInitiativeTable.taskId, taskId))
    .limit(1);
  if (!membership) {
    throw new HTTPException(404, { message: "The task has no initiative" });
  }
  return membership;
}

export function listTaskInitiativeChanges(taskId: string, limit: number) {
  return db
    .select({
      ...getTableColumns(taskInitiativeChangeTable),
      changedByName: changedBy.name,
    })
    .from(taskInitiativeChangeTable)
    .leftJoin(
      changedBy,
      eq(taskInitiativeChangeTable.changedByUserId, changedBy.id),
    )
    .where(eq(taskInitiativeChangeTable.taskId, taskId))
    .orderBy(
      desc(taskInitiativeChangeTable.changedAt),
      desc(taskInitiativeChangeTable.id),
    )
    .limit(limit);
}

export function listInitiativeChanges(initiativeId: string, limit: number) {
  return db
    .select({
      ...getTableColumns(initiativeChangeTable),
      changedByName: changedBy.name,
    })
    .from(initiativeChangeTable)
    .leftJoin(
      changedBy,
      eq(initiativeChangeTable.changedByUserId, changedBy.id),
    )
    .where(eq(initiativeChangeTable.initiativeId, initiativeId))
    .orderBy(
      desc(initiativeChangeTable.changedAt),
      desc(initiativeChangeTable.id),
    )
    .limit(limit);
}

/**
 * The project's test initiative (INTELIA_TASK_INITIATIVE_OPTIONAL), created on
 * first use with its plan open.
 */
export async function ensureTestInitiative(projectId: string) {
  const nameKey = initiativeNameKey(TEST_INITIATIVE_NAME);
  await db
    .insert(initiativeTable)
    .values({
      projectId,
      name: TEST_INITIATIVE_NAME,
      nameKey,
      source: "migration",
    })
    .onConflictDoNothing({
      target: [initiativeTable.projectId, initiativeTable.nameKey],
    });
  const [initiative] = await db
    .select({ id: initiativeTable.id })
    .from(initiativeTable)
    .where(
      and(
        eq(initiativeTable.projectId, projectId),
        eq(initiativeTable.nameKey, nameKey),
      ),
    )
    .limit(1);
  if (!initiative) throw new Error("Test initiative could not be created");
  return initiative.id;
}
