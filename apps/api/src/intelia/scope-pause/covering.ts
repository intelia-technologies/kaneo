import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import db from "../../database";
import { scopePauseTable, taskInitiativeTable } from "../schema";

/**
 * The id of the oldest active pause that covers the task: one of its project,
 * or one of its initiative (which may live in another project). Null when none
 * does.
 */
export async function activePauseCovering(
  taskId: string,
  projectId: string,
): Promise<string | null> {
  const [pause] = await db
    .select({ id: scopePauseTable.id })
    .from(scopePauseTable)
    .where(
      and(
        isNull(scopePauseTable.resumedAt),
        or(
          eq(scopePauseTable.projectId, projectId),
          inArray(
            scopePauseTable.initiativeId,
            db
              .select({ id: taskInitiativeTable.initiativeId })
              .from(taskInitiativeTable)
              .where(eq(taskInitiativeTable.taskId, taskId)),
          ),
        ),
      ),
    )
    .orderBy(asc(scopePauseTable.pausedAt), asc(scopePauseTable.id))
    .limit(1);
  return pause?.id ?? null;
}
