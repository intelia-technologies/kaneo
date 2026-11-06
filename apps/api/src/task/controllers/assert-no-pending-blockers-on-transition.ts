import { and, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../../database";
import { taskRelationTable, taskTable } from "../../database/schema";
import { projectAccessCondition } from "../../project-access/project-access-condition";

type TaskTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const workStatuses = ["queued", "in-progress", "in-review", "ready-to-merge"];

/** Call after locking the target tasks and before any status update. */
export async function assertNoPendingBlockersOnTransition(
  tx: TaskTransaction,
  tasks: Array<{ id: string; status: string }>,
  status: string,
  userId?: string,
) {
  if (!workStatuses.includes(status)) return;
  const ids = tasks
    .filter((task) => task.status !== status)
    .map((task) => task.id);
  if (!ids.length) return;

  const related = await tx
    .select({
      taskId: taskRelationTable.targetTaskId,
      id: taskTable.id,
      status: taskTable.status,
      visible: userId
        ? projectAccessCondition(userId, taskTable.projectId)
        : sql<boolean>`false`,
    })
    .from(taskRelationTable)
    .innerJoin(taskTable, eq(taskRelationTable.sourceTaskId, taskTable.id))
    .where(
      and(
        inArray(taskRelationTable.targetTaskId, ids),
        eq(taskRelationTable.relationType, "blocks"),
      ),
    )
    .orderBy(taskTable.id)
    .for("share", { of: taskTable });
  const blockers = related
    .filter((blocker) => blocker.status !== "done")
    .map(({ taskId, id, status, visible }) =>
      visible ? { taskId, id, status } : { taskId },
    );
  if (blockers.length) {
    throw new HTTPException(409, {
      res: Response.json(
        {
          error: "PENDING_BLOCKERS",
          message: "Task has pending blockers",
          blockers,
        },
        { status: 409 },
      ),
    });
  }
}
