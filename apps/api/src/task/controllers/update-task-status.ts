import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { withLockedTask } from "./with-locked-task";
import { columnTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import {
  ARCHIVED_STATUS,
  archiveInsteadOfStatus,
} from "../../intelia/task-archive/archive-status";
import { announceArchived } from "../../intelia/task-archive/service";
import { publishTaskMutation } from "./task-mutation-effects";
import { assertValidTaskStatus } from "../validate-task-fields";
import { assertNoPendingBlockersOnTransition } from "./assert-no-pending-blockers-on-transition";

async function updateTaskStatus({
  id,
  status,
  currentUserId,
}: {
  id: string;
  status: string;
  currentUserId: string;
}) {
  const {
    before: existingTask,
    after: { task: updatedTask, archivedProjects },
  } = await withLockedTask(id, async (tx, existingTask) => {
    // Intelia (design 53 §3.2): `archived` puts the mark, not the status.
    if (status === ARCHIVED_STATUS && existingTask.status !== ARCHIVED_STATUS) {
      return {
        task: existingTask,
        archivedProjects: await archiveInsteadOfStatus(
          tx,
          [existingTask],
          currentUserId,
        ),
      };
    }
    await assertValidTaskStatus(status, existingTask.projectId, tx);
    await assertNoPendingBlockersOnTransition(
      tx,
      [existingTask],
      status,
      currentUserId,
    );

    const column = await tx.query.columnTable.findFirst({
      where: and(
        eq(columnTable.projectId, existingTask.projectId),
        eq(columnTable.slug, status),
      ),
    });

    const [updatedTask] = await tx
      .update(taskTable)
      .set({ status, columnId: column?.id ?? null })
      .where(eq(taskTable.id, id))
      .returning();

    if (!updatedTask) {
      throw new HTTPException(500, {
        message: "Failed to update task status",
      });
    }
    return { task: updatedTask, archivedProjects: null };
  });

  if (archivedProjects) {
    await announceArchived(archivedProjects);
    return updatedTask;
  }

  await publishTaskMutation(existingTask, updatedTask, currentUserId, {
    fields: ["status"],
  });

  if (
    existingTask.status === updatedTask.status &&
    existingTask.columnId !== updatedTask.columnId
  )
    await publishEvent("task.updated", {
      taskId: updatedTask.id,
      projectId: updatedTask.projectId,
      userId: currentUserId,
    });

  return updatedTask;
}

export default updateTaskStatus;
