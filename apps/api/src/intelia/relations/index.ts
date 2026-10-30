import { and, asc, eq, inArray, or } from "drizzle-orm";
import db from "../../database";
import {
  projectTable,
  taskRelationTable,
  taskTable,
} from "../../database/schema";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../../openapi";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import { taskIsCompleted } from "../../task/task-is-completed";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { projectRelationsSchema } from "./response";

// Relations whose other endpoint is outside the workspace or in a project the
// caller cannot see are omitted, as in GET /api/task-relation/{taskId}.
async function getProjectRelations(
  projectId: string,
  workspaceId: string,
  userId: string,
) {
  const projectTaskIds = db
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(eq(taskTable.projectId, projectId));

  const relations = await db
    .select({
      id: taskRelationTable.id,
      sourceTaskId: taskRelationTable.sourceTaskId,
      targetTaskId: taskRelationTable.targetTaskId,
      relationType: taskRelationTable.relationType,
    })
    .from(taskRelationTable)
    .where(
      or(
        inArray(taskRelationTable.sourceTaskId, projectTaskIds),
        inArray(taskRelationTable.targetTaskId, projectTaskIds),
      ),
    )
    .orderBy(asc(taskRelationTable.createdAt), asc(taskRelationTable.id));

  const endpointIds = [
    ...new Set(
      relations.flatMap((rel) => [rel.sourceTaskId, rel.targetTaskId]),
    ),
  ];
  if (endpointIds.length === 0) return { relations: [], externalTasks: [] };

  const visibleTasks = await db
    .select({
      id: taskTable.id,
      number: taskTable.number,
      title: taskTable.title,
      status: taskTable.status,
      isCompleted: taskIsCompleted,
      projectId: taskTable.projectId,
      projectSlug: projectTable.slug,
      projectName: projectTable.name,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        inArray(taskTable.id, endpointIds),
        eq(projectTable.workspaceId, workspaceId),
        projectAccessCondition(userId, projectTable.id),
      ),
    );
  const visible = new Set(visibleTasks.map((task) => task.id));

  return {
    relations: relations.filter(
      (rel) => visible.has(rel.sourceTaskId) && visible.has(rel.targetTaskId),
    ),
    externalTasks: visibleTasks.filter((task) => task.projectId !== projectId),
  };
}

const getProjectRelationsRoute = createRoute({
  method: "get",
  operationId: "getProjectRelations",
  path: "/project/{projectId}/relations",
  tags: ["Task Relations"],
  summary: "Get project relations",
  description:
    "Get every task relation with at least one endpoint in the project, plus a summary of the endpoints that belong to other projects. Relations pointing to tasks the caller cannot see are omitted.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["read"], task: ["read"] }),
  ] as const,
  request: { params: z.object({ projectId: z.string() }) },
  responses: {
    200: jsonResponse(
      "Project relations and their endpoints in other projects",
      projectRelationsSchema,
    ),
    403: errorResponse("No access to the project, or missing read permission"),
    404: errorResponse("Project not found"),
  },
});

const relations = apiRouter<BaseVariables & { workspaceId: string }>().openapi(
  getProjectRelationsRoute,
  async (c) =>
    c.json(
      await getProjectRelations(
        c.req.valid("param").projectId,
        c.get("workspaceId"),
        c.get("userId"),
      ),
      200,
    ),
);

export default relations;
