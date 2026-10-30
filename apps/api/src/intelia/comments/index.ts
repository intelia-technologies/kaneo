import { and, asc, eq, gt, gte, isNotNull, isNull, or, sql } from "drizzle-orm";
import db from "../../database";
import {
  activityTable,
  projectTable,
  taskTable,
  userTable,
} from "../../database/schema";
import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { workspaceCommentsResponseSchema } from "./response";
import { workspaceCommentsQuery, workspaceIdParam } from "./schema";

export async function listWorkspaceComments(
  workspaceId: string,
  userId: string,
  since: Date,
  limit: number,
  afterId?: string,
) {
  // Proyectos activos del workspace a los que el usuario tiene acceso (DIS-10).
  const projects = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        isNull(projectTable.archivedAt),
        projectAccessCondition(userId, projectTable.id),
      ),
    );

  if (!projects.length) {
    return { comments: [], hasMore: false };
  }

  const projectIds = projects.map((p) => p.id);
  const truncCreatedAt = sql`date_trunc('milliseconds', ${activityTable.createdAt})`;
  const sinceUtc = sql`(${since}::timestamptz at time zone 'UTC')`;

  // Cursor compuesto: con afterId, (createdAt, id) > (since, afterId).
  // Solo since: createdAt >= since.
  // La comparación se hace a nivel de milisegundos con date_trunc y UTC para
  // coincidir exactamente con la precisión ISO de la respuesta (DIS-10).
  // gte(activityTable.createdAt, since) permite aprovechar el índice activity_createdAt_idx.
  const cursorFilter = afterId
    ? and(
        gte(activityTable.createdAt, since),
        or(
          gt(truncCreatedAt, sinceUtc),
          and(eq(truncCreatedAt, sinceUtc), gt(activityTable.id, afterId)),
        ),
      )
    : and(gte(activityTable.createdAt, since), gte(truncCreatedAt, sinceUtc));

  const rows = await db
    .select({
      id: activityTable.id,
      taskId: taskTable.id,
      taskTitle: taskTable.title,
      taskStatus: taskTable.status,
      projectId: projectTable.id,
      userId: activityTable.userId,
      userName: userTable.name,
      externalUserName: activityTable.externalUserName,
      content: activityTable.content,
      createdAt: sql<Date>`${truncCreatedAt}`.mapWith(activityTable.createdAt),
    })
    .from(activityTable)
    .innerJoin(taskTable, eq(activityTable.taskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(userTable, eq(activityTable.userId, userTable.id))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        isNull(projectTable.archivedAt),
        sql`${taskTable.projectId} = ANY(${sql.param(projectIds)}::text[])`,
        eq(activityTable.type, "comment"),
        isNotNull(activityTable.content),
        cursorFilter,
      ),
    )
    .orderBy(asc(truncCreatedAt), asc(activityTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const returnedRows = hasMore ? rows.slice(0, limit) : rows;

  return {
    comments: returnedRows.map((row) => ({
      id: row.id,
      taskId: row.taskId,
      taskTitle: row.taskTitle,
      taskStatus: row.taskStatus,
      projectId: row.projectId,
      userId: row.userId,
      userName: row.userName,
      externalUserName: row.externalUserName,
      content: row.content!,
      createdAt: row.createdAt,
    })),
    hasMore,
  };
}

const listWorkspaceCommentsRoute = createRoute({
  method: "get",
  operationId: "listWorkspaceComments",
  path: "/workspace/{workspaceId}/comments",
  tags: ["Comments"],
  summary: "List workspace comments by date",
  description:
    "Comments across the workspace's active projects visible to the caller, created at or after since, ordered ascending by (createdAt, id) for event reconciliation.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ project: ["read"], task: ["read"] }),
  ] as const,
  request: {
    params: workspaceIdParam,
    query: workspaceCommentsQuery,
  },
  responses: {
    200: jsonResponse(
      "Comments of the workspace",
      workspaceCommentsResponseSchema,
    ),
    400: errorResponse("Invalid query parameters"),
    403: errorResponse("Missing project:read or task:read permission"),
    404: errorResponse("Workspace not found or not a member"),
  },
});

const comments = apiRouter().openapi(listWorkspaceCommentsRoute, async (c) => {
  const { workspaceId } = c.req.valid("param");
  const { since, limit, afterId } = c.req.valid("query");
  return c.json(
    await listWorkspaceComments(
      workspaceId,
      c.get("userId"),
      since,
      limit,
      afterId,
    ),
    200,
  );
});

export default comments;
