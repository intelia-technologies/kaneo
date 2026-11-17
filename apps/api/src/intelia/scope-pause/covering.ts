import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import db from "../../database";
import { projectTable } from "../../database/schema";
import {
  initiativeTable,
  scopePauseTable,
  taskInitiativeTable,
} from "../schema";

export type CoveringPause = {
  id: string;
  scopeType: "project" | "initiative";
  scopeName: string;
  /** The paused project, or the initiative's home project. */
  homeProjectId: string;
  motivo: string;
};

/**
 * The oldest active pause that covers the task: one of its project, or one of
 * its initiative (which may live in another project). Null when none does.
 */
export async function activePauseCovering(
  taskId: string,
  projectId: string,
): Promise<CoveringPause | null> {
  const [pause] = await db
    .select({
      id: scopePauseTable.id,
      scopeType: scopePauseTable.scopeType,
      projectName: projectTable.name,
      pausedProjectId: scopePauseTable.projectId,
      initiativeProjectId: initiativeTable.projectId,
      initiativeName: initiativeTable.name,
      motivo: scopePauseTable.motivo,
    })
    .from(scopePauseTable)
    .leftJoin(projectTable, eq(projectTable.id, scopePauseTable.projectId))
    .leftJoin(
      initiativeTable,
      eq(initiativeTable.id, scopePauseTable.initiativeId),
    )
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
  if (!pause) return null;
  return {
    id: pause.id,
    scopeType: pause.scopeType,
    scopeName: pause.projectName ?? pause.initiativeName ?? "",
    homeProjectId: pause.pausedProjectId ?? pause.initiativeProjectId ?? "",
    motivo: pause.motivo,
  };
}
