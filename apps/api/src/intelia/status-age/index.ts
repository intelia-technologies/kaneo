import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../../openapi";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { getProjectStatusAge } from "./read";
import { projectStatusAgeSchema } from "./response";

const getProjectStatusAgeRoute = createRoute({
  method: "get",
  operationId: "getProjectStatusAge",
  path: "/project/{projectId}/status-age",
  tags: ["Tasks"],
  summary: "Get project status age",
  description:
    "When each open task entered its column, and the 75th and 90th percentiles of how long tasks stay in each column (finished stays of the last 90 days, at least 10 of them). The same access as listing the project's tasks.",
  // Design 23 §6: the access of GET /api/task/tasks/{projectId}.
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["read"], task: ["read"] }),
  ] as const,
  request: { params: z.object({ projectId: z.string() }) },
  responses: {
    200: jsonResponse(
      "Entry dates of the open tasks and percentiles by column",
      projectStatusAgeSchema,
    ),
    403: errorResponse("No access to the project, or missing read permission"),
    404: errorResponse("Project not found"),
  },
});

const statusAge = apiRouter<BaseVariables & { workspaceId: string }>().openapi(
  getProjectStatusAgeRoute,
  async (c) =>
    c.json(await getProjectStatusAge(c.req.valid("param").projectId), 200),
);

export default statusAge;
