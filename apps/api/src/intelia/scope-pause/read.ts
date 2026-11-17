import { and, asc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../../database";
import { projectTable, taskTable, userTable } from "../../database/schema";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import {
  initiativeTable,
  scopePauseTable,
  taskInitiativeTable,
} from "../schema";
import type { ScopePause } from "./response";

/** Who reads: the caller and the workspace its request resolved to. */
export type PauseReader = { userId: string; workspaceId: string };

const pausedBy = alias(userTable, "scope_pause_paused_by");
const resumedBy = alias(userTable, "scope_pause_resumed_by");

// The project or, for an initiative, its home project.
const homeProjectId = sql<string>`coalesce(${scopePauseTable.projectId}, ${initiativeTable.projectId})`;

// The same project rule as the rest of Kaneo, resolved once per read so the
// task list of a large initiative does not evaluate it row by row.
async function readableProjectIds(reader: PauseReader) {
  const rows = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.workspaceId, reader.workspaceId),
        projectAccessCondition(reader.userId, projectTable.id),
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * The pauses of the reader's workspace that match `where`, oldest first. A
 * pause is visible when the reader can read its home project; an initiative
 * pause lists its tasks of every project the reader can read.
 */
export async function readPauses(
  reader: PauseReader,
  where?: SQL,
): Promise<ScopePause[]> {
  const projectIds = await readableProjectIds(reader);
  if (projectIds.length === 0) return [];

  const rows = await db
    .select({
      pause: scopePauseTable,
      initiativeName: initiativeTable.name,
      projectName: projectTable.name,
      homeProjectId: projectTable.id,
      workspaceId: projectTable.workspaceId,
      pausedByName: pausedBy.name,
      resumedByName: resumedBy.name,
    })
    .from(scopePauseTable)
    .leftJoin(
      initiativeTable,
      eq(initiativeTable.id, scopePauseTable.initiativeId),
    )
    .innerJoin(projectTable, eq(projectTable.id, homeProjectId))
    .leftJoin(pausedBy, eq(pausedBy.id, scopePauseTable.pausedByUserId))
    .leftJoin(resumedBy, eq(resumedBy.id, scopePauseTable.resumedByUserId))
    // The readable projects are all in the reader's workspace, so this also
    // keeps out other workspaces' pauses (the workspace is the home project's).
    .where(and(inArray(projectTable.id, projectIds), where))
    .orderBy(asc(scopePauseTable.pausedAt), asc(scopePauseTable.id));

  const initiativeIds = rows.flatMap((row) =>
    row.pause.initiativeId ? [row.pause.initiativeId] : [],
  );
  const tasksByInitiative = new Map<string, string[]>();
  if (initiativeIds.length > 0) {
    const members = await db
      .select({
        taskId: taskInitiativeTable.taskId,
        initiativeId: taskInitiativeTable.initiativeId,
      })
      .from(taskInitiativeTable)
      .innerJoin(taskTable, eq(taskTable.id, taskInitiativeTable.taskId))
      .where(
        and(
          inArray(taskInitiativeTable.initiativeId, initiativeIds),
          inArray(taskTable.projectId, projectIds),
        ),
      )
      .orderBy(asc(taskInitiativeTable.taskId));
    for (const { taskId, initiativeId } of members) {
      const list = tasksByInitiative.get(initiativeId);
      if (list) list.push(taskId);
      else tasksByInitiative.set(initiativeId, [taskId]);
    }
  }

  return rows.map(
    ({
      pause,
      initiativeName,
      projectName,
      homeProjectId,
      workspaceId,
      pausedByName,
      resumedByName,
    }) => ({
      id: pause.id,
      workspaceId,
      scopeType: pause.scopeType,
      projectId: homeProjectId,
      initiativeId: pause.initiativeId,
      scopeName: pause.initiativeId ? (initiativeName ?? "") : projectName,
      ...(pause.initiativeId
        ? { taskIds: tasksByInitiative.get(pause.initiativeId) ?? [] }
        : {}),
      motivo: pause.motivo,
      revisarEl: pause.revisarEl,
      pausedByUserId: pause.pausedByUserId,
      pausedByName,
      pausedByActor: pause.pausedByActor,
      pausedAt: pause.pausedAt,
      resumedByUserId: pause.resumedByUserId,
      resumedByName: pause.resumedByUserId ? resumedByName : null,
      resumedByActor: pause.resumedByActor,
      resumedAt: pause.resumedAt,
      notaReanudar: pause.notaReanudar,
    }),
  );
}

/** One pause as the reader sees it, or null. */
export async function readPause(reader: PauseReader, pauseId: string) {
  const [pause] = await readPauses(reader, eq(scopePauseTable.id, pauseId));
  return pause ?? null;
}
