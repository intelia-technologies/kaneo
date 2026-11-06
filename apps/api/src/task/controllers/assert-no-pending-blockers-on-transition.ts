import { and, eq, inArray, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../../database";
import { taskRelationTable, taskTable } from "../../database/schema";

type TaskTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const workStatuses = ["queued", "in-progress", "in-review", "ready-to-merge"];

/** Call after locking the target tasks and before any status update. */
export async function assertNoPendingBlockersOnTransition(
  tx: TaskTransaction,
  tasks: Array<{ id: string; status: string }>,
  status: string,
) {
  if (!workStatuses.includes(status)) return;
  const ids = tasks
    .filter((task) => task.status !== status)
    .map((task) => task.id);
  if (!ids.length) return;

  const blockers = await tx
    .select({
      taskId: taskRelationTable.targetTaskId,
      id: taskTable.id,
      status: taskTable.status,
    })
    .from(taskRelationTable)
    .innerJoin(taskTable, eq(taskRelationTable.sourceTaskId, taskTable.id))
    .where(
      and(
        inArray(taskRelationTable.targetTaskId, ids),
        eq(taskRelationTable.relationType, "blocks"),
        ne(taskTable.status, "done"),
      ),
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
