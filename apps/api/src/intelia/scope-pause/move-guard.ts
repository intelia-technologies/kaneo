import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { taskTable } from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import {
  initiativeTable,
  scopePauseTable,
  taskInitiativeTable,
} from "../schema";
import type { Transaction } from "../task-automation/service";

/**
 * Refuses to move a project to another workspace while an active initiative
 * pause spans it and some other project: the initiative's home project and
 * its tasks would end up in different workspaces, and neither workspace's
 * list of pauses could show that pause with all its tasks, so the dispatcher
 * would stop seeing tasks the pause still covers. Pauses of the project itself
 * move with it (their workspace is the home project's).
 */
export async function assertNoPauseAcrossWorkspaces(
  tx: Transaction,
  projectId: string,
) {
  const [spanning] = await tx
    .select({ pauseId: scopePauseTable.id, name: initiativeTable.name })
    .from(scopePauseTable)
    .innerJoin(
      initiativeTable,
      eq(initiativeTable.id, scopePauseTable.initiativeId),
    )
    .where(
      and(
        isNull(scopePauseTable.resumedAt),
        // The initiative touches the project: it is its home, or has a task
        // there…
        or(
          eq(initiativeTable.projectId, projectId),
          sql`exists (select 1 from ${taskInitiativeTable} join ${taskTable} on ${taskTable.id} = ${taskInitiativeTable.taskId} where ${taskInitiativeTable.initiativeId} = ${initiativeTable.id} and ${taskTable.projectId} = ${projectId})`,
        ),
        // …and some other project: its home, or a task elsewhere.
        or(
          ne(initiativeTable.projectId, projectId),
          sql`exists (select 1 from ${taskInitiativeTable} join ${taskTable} on ${taskTable.id} = ${taskInitiativeTable.taskId} where ${taskInitiativeTable.initiativeId} = ${initiativeTable.id} and ${taskTable.projectId} <> ${projectId})`,
        ),
      ),
    )
    .limit(1);
  if (spanning) {
    throw new ApiError(409, {
      message:
        "The project shares a paused initiative with other projects; resume the pause before moving it to another workspace",
      code: "PAUSA_ENTRE_PROYECTOS",
    });
  }
}
