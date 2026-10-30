import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { subscribeToEvent } from "../../events";
import { taskIsCompleted } from "../../task/task-is-completed";
import { routineRunTable, routineTable } from "../schema";

// When a routine's task reaches a final column (Done, Cancelled), its open
// history rows record when. Error rows are left alone: the reopen failed, so
// the task never left its final column. Idempotent, so it listens to every
// event that can carry a status change (imports use task.updated).
export async function closeRoutineRuns({ taskId }: { taskId: string }) {
  const [task] = await db
    .select({ completed: taskIsCompleted })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);
  if (!task?.completed) return;
  await db
    .update(routineRunTable)
    .set({ closedAt: new Date() })
    .where(
      and(
        isNull(routineRunTable.closedAt),
        ne(routineRunTable.result, "error"),
        inArray(
          routineRunTable.routineId,
          db
            .select({ id: routineTable.id })
            .from(routineTable)
            .where(eq(routineTable.taskId, taskId)),
        ),
      ),
    );
}

for (const eventType of ["task.status_changed", "task.moved", "task.updated"]) {
  subscribeToEvent(eventType, closeRoutineRuns);
}
