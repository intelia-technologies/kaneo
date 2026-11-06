import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishTaskMutation } from "./task-mutation-effects";
import {
  assertAssignableUser,
  getProjectWorkspaceId,
  lockAssignableUser,
} from "../../utils/assert-assignable-user";

async function updateTaskAssignee({
  id,
  userId,
  currentUserId,
}: {
  id: string;
  userId: string | null;
  currentUserId: string;
}) {
  const nextAssigneeId = userId?.trim() || null;
  const { before: existingTask, after: updatedTask } = await db.transaction(
    async (tx) => {
      const [snapshot] = await tx
        .select({ projectId: taskTable.projectId })
        .from(taskTable)
        .where(eq(taskTable.id, id));
      if (!snapshot)
        throw new HTTPException(404, { message: "Task not found" });
      if (nextAssigneeId) {
        const workspaceId = await getProjectWorkspaceId(snapshot.projectId, tx);
        await lockAssignableUser(tx, workspaceId, nextAssigneeId);
        await assertAssignableUser(
          nextAssigneeId,
          workspaceId,
          snapshot.projectId,
          tx,
        );
      }
      const [existingTask] = await tx
        .select()
        .from(taskTable)
        .where(eq(taskTable.id, id))
        .for("update");
      if (!existingTask)
        throw new HTTPException(404, { message: "Task not found" });
      if (existingTask.projectId !== snapshot.projectId)
        throw new HTTPException(409, {
          message: "Task changed projects; retry the update",
        });
      if (existingTask.userId === nextAssigneeId) {
        return { before: existingTask, after: existingTask };
      }

      const [updatedTask] = await tx
        .update(taskTable)
        .set({ userId: nextAssigneeId })
        .where(eq(taskTable.id, id))
        .returning();

      if (!updatedTask) {
        throw new HTTPException(500, {
          message: "Failed to update task assignee",
        });
      }

      return { before: existingTask, after: updatedTask };
    },
  );

  await publishTaskMutation(existingTask, updatedTask, currentUserId, {
    fields: ["userId"],
  });

  return updatedTask;
}

export default updateTaskAssignee;
