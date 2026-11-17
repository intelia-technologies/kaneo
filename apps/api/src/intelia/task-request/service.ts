import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import db from "../../database";
import {
  projectTable,
  taskTable,
  userTable,
  workspaceUserTable,
} from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import {
  dispatchNotification,
  persistNotification,
} from "../../notification/controllers/create-notification";
import { CANCELLED } from "../initiatives/service";
import { taskRequestTable } from "../schema";

export type RequesterWriter = {
  userId: string;
  actor: string | null;
};

const notFound = () =>
  new ApiError(404, { message: "Task not found", code: "NOT_FOUND" });

export const isCancelledStatus = (status: string) => CANCELLED.has(status);

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
