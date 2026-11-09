import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import db from "../../database";
import {
  columnTable,
  projectTable,
  taskTable,
  userTable,
  workspaceUserTable,
} from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import { publishEvent } from "../../events";
import {
  dispatchNotification,
  persistNotification,
} from "../../notification/controllers/create-notification";
import { publishTaskMutation } from "../../task/controllers/task-mutation-effects";
import { withLockedTask } from "../../task/controllers/with-locked-task";
import { CANCELLED } from "../initiatives/service";
import { taskRequestTable } from "../schema";
import { isRequestedStatus } from "./status";

export type RequesterWriter = {
  userId: string;
  actor: string | null;
};

const notFound = () =>
  new ApiError(404, { message: "Task not found", code: "NOT_FOUND" });

export const isCancelledStatus = (status: string) => CANCELLED.has(status);

// The final column a rejection creates where the project has none.
const CANCELLED_COLUMN_SLUG = "cancelled";
const CANCELLED_COLUMN_NAME = "Cancelled";

/** The task's requester, or null; for members of the task's project. */
export async function getTaskRequester(taskId: string) {
  const [row] = await db
    .select({
      taskId: taskRequestTable.taskId,
      userId: taskRequestTable.requesterUserId,
      name: userTable.name,
      requestedAt: taskRequestTable.requestedAt,
      closedAt: taskRequestTable.closedAt,
      closedReason: taskRequestTable.closedReason,
    })
    .from(taskRequestTable)
    .leftJoin(userTable, eq(userTable.id, taskRequestTable.requesterUserId))
    .where(eq(taskRequestTable.taskId, taskId))
    .limit(1);
  if (!row) return null;
  return {
    taskId: row.taskId,
    requester: { userId: row.userId, name: row.name },
    requestedAt: row.requestedAt,
    closedAt: row.closedAt,
    closedReason: row.closedReason,
  };
}

/**
 * Sets who asked for the task. The requester must belong to the task's
 * workspace, but needs no access to its project. A cancelled task takes no
 * requester: it would not give access anyway.
 */
export async function setTaskRequester(
  taskId: string,
  requesterUserId: string,
  writer: RequesterWriter,
) {
  await db.transaction(async (tx) => {
    const [task] = await tx
      .select({
        status: taskTable.status,
        workspaceId: projectTable.workspaceId,
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(projectTable.id, taskTable.projectId))
      .where(eq(taskTable.id, taskId))
      .for("update", { of: taskTable });
    if (!task) throw notFound();
    if (isCancelledStatus(task.status)) {
      throw new ApiError(409, {
        message: "A cancelled task takes no requester",
        code: "TASK_CANCELLED",
      });
    }
    const [member] = await tx
      .select({ userId: workspaceUserTable.userId })
      .from(workspaceUserTable)
      .where(
        and(
          eq(workspaceUserTable.workspaceId, task.workspaceId),
          eq(workspaceUserTable.userId, requesterUserId),
        ),
      )
      .limit(1);
    if (!member) {
      throw new ApiError(400, {
        message: "The requester must be a member of the task's workspace",
        code: "REQUESTER_NOT_MEMBER",
        issues: [{ path: "body.userId", message: "Not a workspace member" }],
      });
    }
    const values = {
      requesterUserId,
      setByUserId: writer.userId,
      setByActor: writer.actor,
      requestedAt: new Date(),
      pendingReason: null,
      closedAt: null,
      closedReason: null,
    };
    await tx
      .insert(taskRequestTable)
      .values({ taskId, ...values })
      .onConflictDoUpdate({ target: taskRequestTable.taskId, set: values });
  });
  return getTaskRequester(taskId);
}

/** Removes the requester, and with it their access. Idempotent. */
export async function clearTaskRequester(taskId: string) {
  await db.delete(taskRequestTable).where(eq(taskRequestTable.taskId, taskId));
}

/**
 * Follows the task's status: in a cancelled column the request closes (once)
 * and the requester gets the notice, with the reason if a rejection gave one
 * (an ordinary cancellation asks for none); out of it, a closed request opens
 * again. Runs on every event that can carry a status change, whichever path
 * made it, and is idempotent. The close and the notice commit together.
 */
export async function syncTaskRequest({ taskId }: { taskId: string }) {
  const [task] = await db
    .select({
      status: taskTable.status,
      title: taskTable.title,
      projectId: taskTable.projectId,
      projectName: projectTable.name,
      workspaceId: projectTable.workspaceId,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(projectTable.id, taskTable.projectId))
    .where(eq(taskTable.id, taskId))
    .limit(1);
  if (!task) return;

  if (!isCancelledStatus(task.status)) {
    await db
      .update(taskRequestTable)
      .set({ closedAt: null, closedReason: null })
      .where(
        and(
          eq(taskRequestTable.taskId, taskId),
          isNotNull(taskRequestTable.closedAt),
        ),
      );
    return;
  }

  const notification = await db.transaction(async (tx) => {
    const [closed] = await tx
      .update(taskRequestTable)
      .set({
        closedAt: new Date(),
        closedReason: sql`${taskRequestTable.pendingReason}`,
        pendingReason: null,
      })
      .where(
        and(
          eq(taskRequestTable.taskId, taskId),
          isNull(taskRequestTable.closedAt),
        ),
      )
      .returning({
        requesterUserId: taskRequestTable.requesterUserId,
        reason: taskRequestTable.closedReason,
      });
    if (!closed) return null;
    // A workspace notice, not a task one: the requester can no longer read
    // the task, and a task notice would be withheld from them.
    return persistNotification(
      {
        userId: closed.requesterUserId,
        type: "task_request_closed",
        title: closed.reason
          ? `Request rejected: ${task.title}`
          : `Request cancelled: ${task.title}`,
        content: closed.reason ?? `${task.projectName} cancelled the task.`,
        eventData: {
          taskId,
          taskTitle: task.title,
          projectId: task.projectId,
          projectName: task.projectName,
          workspaceId: task.workspaceId,
          outcome: closed.reason ? "rejected" : "cancelled",
          reason: closed.reason,
        },
        resourceId: task.workspaceId,
        resourceType: "workspace",
      },
      tx,
    );
  });
  if (notification) await dispatchNotification(notification);
}

/**
 * Rejects a request still in «Pedida»: moves the task to its project's
 * cancelled column and keeps the reason for the requester's notice. A
 * project without one (the default board has none) gets a final «Cancelled»
 * column, last. The check and the move run under the task's row lock, the
 * one every status change takes, so a task moved out of «Pedida» meanwhile
 * is not cancelled.
 */
export async function rejectTaskRequest(
  taskId: string,
  reason: string,
  currentUserId: string,
) {
  let createdColumn = false;
  const { before, after } = await withLockedTask(taskId, async (tx, task) => {
    const [request] = await tx
      .select({ closedAt: taskRequestTable.closedAt })
      .from(taskRequestTable)
      .where(eq(taskRequestTable.taskId, taskId))
      .limit(1);
    if (!request) {
      throw new ApiError(409, {
        message: "The task has no requester",
        code: "TASK_NOT_REQUESTED",
      });
    }
    if (!isRequestedStatus(task.status)) {
      throw new ApiError(409, {
        message: "Only a task in «Pedida» can be rejected",
        code: "TASK_NOT_PENDING_REQUEST",
      });
    }
    // The lock create-column takes: no concurrent column gets the slug.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(1525, hashtext(${task.projectId}))`,
    );
    const columns = await tx
      .select({
        id: columnTable.id,
        slug: columnTable.slug,
        position: columnTable.position,
      })
      .from(columnTable)
      .where(eq(columnTable.projectId, task.projectId))
      .orderBy(asc(columnTable.position));
    let cancelled: { id: string; slug: string } | undefined = columns.find(
      (column) => isCancelledStatus(column.slug),
    );
    if (!cancelled) {
      [cancelled] = await tx
        .insert(columnTable)
        .values({
          projectId: task.projectId,
          name: CANCELLED_COLUMN_NAME,
          slug: CANCELLED_COLUMN_SLUG,
          position: Math.max(-1, ...columns.map((c) => c.position)) + 1,
          isFinal: true,
        })
        .returning({ id: columnTable.id, slug: columnTable.slug });
      createdColumn = true;
    }
    await tx
      .update(taskRequestTable)
      .set({ pendingReason: reason })
      .where(eq(taskRequestTable.taskId, taskId));
    const [updated] = await tx
      .update(taskTable)
      .set({ status: cancelled!.slug, columnId: cancelled!.id })
      .where(eq(taskTable.id, taskId))
      .returning();
    return updated!;
  });
  if (createdColumn)
    await publishEvent("project.updated", { projectId: after.projectId });
  // The same events as any status change (activity, webhooks, live boards).
  await publishTaskMutation(before, after, currentUserId, {
    fields: ["status"],
  });
  // The status event closes it too; whichever runs first sends the notice.
  await syncTaskRequest({ taskId });
  return getTaskRequester(taskId);
}
