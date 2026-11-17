import { asc, eq, sql } from "drizzle-orm";
import db from "../../database";
import { columnTable, taskTable } from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import { publishEvent } from "../../events";
import { assertCancelResolved } from "../../task/controllers/assert-cancel-resolved";
import { publishTaskMutation } from "../../task/controllers/task-mutation-effects";
import { withLockedTask } from "../../task/controllers/with-locked-task";
import { taskRequestTable } from "../schema";
import type { AutomationWriter, Transaction } from "../task-automation/service";
import { buildChain } from "../task-cancel/chain";
import { cancelGuardEnabled } from "../task-cancel/guard";
import { loadGraph } from "../task-cancel/load-graph";
import { cancelTask } from "../task-cancel/service";
import type { RawResolution } from "../task-cancel/types";
import {
  getTaskRequester,
  isCancelledStatus,
  syncTaskRequest,
} from "./service";
import { isRequestedStatus } from "./status";

// The final column a rejection creates where the project has none.
const CANCELLED_COLUMN_SLUG = "cancelled";
const CANCELLED_COLUMN_NAME = "Cancelled";

/** Only a requested task still in «Pedida» is rejected. */
async function assertPendingRequest(
  ex: typeof db | Transaction,
  taskId: string,
  status: string,
) {
  const [request] = await ex
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
  if (!isRequestedStatus(status)) {
    throw new ApiError(409, {
      message: "Only a task in «Pedida» can be rejected",
      code: "TASK_NOT_PENDING_REQUEST",
    });
  }
}

/** Under the task's row lock: checks it and keeps the reason for the notice. */
async function holdRequest(
  tx: Transaction,
  taskId: string,
  status: string,
  reason: string,
) {
  await assertPendingRequest(tx, taskId, status);
  await tx
    .update(taskRequestTable)
    .set({ pendingReason: reason })
    .where(eq(taskRequestTable.taskId, taskId));
}

/**
 * Rejects a request still in «Pedida»: moves the task to its project's
 * cancelled column and keeps the reason for the requester's notice. A
 * project without one (the default board has none) gets a final «Cancelled»
 * column, last. The check and the move run under the task's row lock, the
 * one every status change takes, so a task moved out of «Pedida» meanwhile
 * is not cancelled.
 *
 * A task with open dependents is cancelled like `/cancel` does (design 82,
 * decision 17), with the reason as its `motivo`: with the guard on, or with
 * `resoluciones`, they must cover its chain or nothing changes (409
 * `DEPENDENCIAS_SIN_RESOLVER`); dependents of other boards only are handled
 * on their own.
 */
export async function rejectTaskRequest({
  taskId,
  reason,
  resoluciones = [],
  userId,
  userName,
  workspaceId,
  writer,
}: {
  taskId: string;
  reason: string;
  resoluciones?: RawResolution[];
  userId: string;
  userName: string | null;
  workspaceId: string;
  writer: AutomationWriter;
}) {
  if (resoluciones.length || cancelGuardEnabled()) {
    const graph = await loadGraph(db, taskId, userId);
    if (graph && buildChain(graph).length) {
      // The request's own errors come before the chain's.
      await assertPendingRequest(db, taskId, graph.root.status);
      await cancelTask({
        taskId,
        workspaceId,
        userId,
        userName,
        writer,
        // The reason is the `motivo`, within its bounds (10 to 1000): out of
        // them it counts as missing, and the 409 asks for one.
        input: {
          motivo:
            reason.length >= 10 && reason.length <= 1000 ? reason : undefined,
          resoluciones,
        },
        onLocked: (tx, root) => holdRequest(tx, taskId, root.status, reason),
      });
      // The status event closes it too; whichever runs first sends the notice.
      await syncTaskRequest({ taskId });
      return getTaskRequester(taskId);
    }
  }

  let createdColumn = false;
  const { before, after } = await withLockedTask(taskId, async (tx, task) => {
    await holdRequest(tx, taskId, task.status, reason);
    // A dependent added since the read above still gets the 409.
    await assertCancelResolved(tx, [task], CANCELLED_COLUMN_SLUG, userId);
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
  await publishTaskMutation(before, after, userId, {
    fields: ["status"],
  });
  // The status event closes it too; whichever runs first sends the notice.
  await syncTaskRequest({ taskId });
  return getTaskRequester(taskId);
}
