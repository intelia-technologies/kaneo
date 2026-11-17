import { type SQLWrapper, sql } from "drizzle-orm";
import { taskTable } from "../../database/schema";
import { projectAccessCondition } from "../../project-access/project-access-condition";

export type BoardTaskInitiative = {
  id: string;
  projectId: string;
  name: string | null;
};

type BoardInitiativeReader = {
  /** The workspace of the task's project: an initiative elsewhere is left out. */
  workspaceId: string | SQLWrapper;
  publicOnly: boolean;
  userId?: string;
};

/**
 * The task's initiative for the board's rows (KF-23), in the board's own
 * statement: one correlated lookup by primary key, never a query per row. The
 * initiative may be of another project of the workspace (design 52 §3.1); its
 * name is null when the reader cannot read that project, the same rule as
 * GET …/task/{taskId}/initiative. A public board only shows initiatives of
 * public projects, and none otherwise.
 */
export function boardTaskInitiative({
  workspaceId,
  publicOnly,
  userId,
}: BoardInitiativeReader) {
  const readable = publicOnly
    ? sql`true`
    : userId
      ? projectAccessCondition(userId, sql`board_initiative_project.id`)
      : sql`false`;
  return sql<BoardTaskInitiative | null>`(
    select json_build_object(
      'id', board_initiative.id,
      'projectId', board_initiative.project_id,
      'name', case when ${readable} then board_initiative.name end
    )
    from intelia.task_initiative board_task_initiative
    join intelia.initiative board_initiative
      on board_initiative.id = board_task_initiative.initiative_id
    join project board_initiative_project
      on board_initiative_project.id = board_initiative.project_id
    where board_task_initiative.task_id = ${taskTable.id}
      and board_initiative_project.workspace_id = ${workspaceId}
      ${publicOnly ? sql`and board_initiative_project.is_public = true` : sql``}
  )`;
}
