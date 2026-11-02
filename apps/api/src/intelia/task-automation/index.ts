import type { Context, Next } from "hono";
import { ApiError } from "../../errors/api-error";
import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import type { PermissionMap } from "../../utils/role-permissions";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { isGatewayRequest } from "./gateway";
import {
  taskAutomationChangeListSchema,
  taskAutomationListSchema,
  taskAutomationSchema,
} from "./response";
import {
  automationHistoryQuery,
  projectIdParam,
  putAutomationInput,
  taskIdParam,
} from "./schema";
import {
  type AutomationWriter,
  getAutomation,
  listAutomationChanges,
  listProjectAutomation,
  setAutomation,
} from "./service";

// The gateway already checked the agent's permission in the graph; anyone else
// goes through Kaneo's workspace access and permissions.
function gatewayOr(
  access: (c: Context, next: Next) => Promise<Response | void>,
  permissions: PermissionMap,
) {
  return async (c: Context, next: Next) => {
    if (isGatewayRequest(c)) return next();
    return access(c, async () => {
      await requireWorkspacePermission(permissions)(c, next);
    });
  };
}

// Writing the level: a person's session or the gateway, never an API key
// (design 18 §5). Role and agent accounts only hold API keys, and the gateway
// keeps them, so this stops anyone from skipping the gateway's graph check.
async function requireSessionOrGateway(c: Context, next: Next) {
  if (isGatewayRequest(c)) return next();
  if (c.get("apiKey") || !c.get("session")) {
    throw new ApiError(403, {
      message:
        "Changing the automation level needs a person's session or the gateway's service token; API keys are rejected",
      code: "AUTOMATION_WRITE_FORBIDDEN",
    });
  }
  return next();
}

const getAutomationRoute = createRoute({
  method: "get",
  operationId: "getTaskAutomation",
  path: "/task/{taskId}/automation",
  tags: ["Task Automation"],
  summary: "Get task automation level",
  description:
    "The task's automation level and verification, with who set them and when. Also with the gateway's service token (`X-Service-Token`).",
  middleware: [
    gatewayOr(workspaceAccess.fromTaskId("taskId"), { task: ["read"] }),
  ] as const,
  request: { params: taskIdParam },
  responses: {
    200: jsonResponse("The task's automation level", taskAutomationSchema),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Task not found or level not set"),
  },
});

const putAutomationRoute = createRoute({
  method: "put",
  operationId: "putTaskAutomation",
  path: "/task/{taskId}/automation",
  tags: ["Task Automation"],
  summary: "Set task automation level",
  description:
    "Set or change the task's level and verification; each change goes to the change log. Only a person's session (with task:update) or the gateway's service token (`X-Service-Token`, with `actor`); API keys get 403. `completa` requires verification.",
  middleware: [
    requireSessionOrGateway,
    gatewayOr(workspaceAccess.fromTaskId("taskId"), { task: ["update"] }),
  ] as const,
  request: {
    params: taskIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: putAutomationInput } },
    },
  },
  responses: {
    200: jsonResponse("The task's automation level", taskAutomationSchema),
    400: errorResponse(
      "Invalid level, `completa` without verification, or `actor` missing (gateway) or present (session)",
    ),
    403: errorResponse(
      "An API key, no access to the project, or missing task:update",
    ),
    404: errorResponse("Task not found"),
  },
});

const listChangesRoute = createRoute({
  method: "get",
  operationId: "listTaskAutomationChanges",
  path: "/task/{taskId}/automation/history",
  tags: ["Task Automation"],
  summary: "Get task automation change log",
  description: "Every setting and change of the level, newest first.",
  middleware: [
    gatewayOr(workspaceAccess.fromTaskId("taskId"), { task: ["read"] }),
  ] as const,
  request: { params: taskIdParam, query: automationHistoryQuery },
  responses: {
    200: jsonResponse("Changes of the level", taskAutomationChangeListSchema),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Task not found"),
  },
});

const listProjectRoute = createRoute({
  method: "get",
  operationId: "listProjectTaskAutomation",
  path: "/project/{projectId}/automation",
  tags: ["Task Automation"],
  summary: "List project automation levels",
  description:
    "The level of every task in the project that has one, by task number. Tasks without a level are absent.",
  middleware: [
    gatewayOr(workspaceAccess.fromProjectId("projectId"), {
      project: ["read"],
      task: ["read"],
    }),
  ] as const,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse(
      "Levels of the project's tasks",
      taskAutomationListSchema,
    ),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Project not found"),
  },
});

function writer(c: Context, actor: string | undefined): AutomationWriter {
  if (isGatewayRequest(c)) {
    if (!actor) {
      throw new ApiError(400, {
        message: "`actor` is required with the service token",
        code: "VALIDATION_ERROR",
        issues: [{ path: "body.actor", message: "Required" }],
      });
    }
    return { source: "gateway", actor };
  }
  if (actor) {
    throw new ApiError(400, {
      message: "`actor` is only for the gateway; a session acts as its user",
      code: "VALIDATION_ERROR",
      issues: [{ path: "body.actor", message: "Not allowed" }],
    });
  }
  return { source: "session", userId: c.get("userId") };
}

const taskAutomation = apiRouter()
  .openapi(getAutomationRoute, async (c) =>
    c.json(await getAutomation(c.req.valid("param").taskId), 200),
  )
  .openapi(putAutomationRoute, async (c) => {
    const { level, verification, actor } = c.req.valid("json");
    return c.json(
      await setAutomation(
        c.req.valid("param").taskId,
        { level, verification },
        writer(c, actor),
      ),
      200,
    );
  })
  .openapi(listChangesRoute, async (c) =>
    c.json(
      await listAutomationChanges(
        c.req.valid("param").taskId,
        c.req.valid("query").limit,
      ),
      200,
    ),
  )
  .openapi(listProjectRoute, async (c) =>
    c.json(await listProjectAutomation(c.req.valid("param").projectId), 200),
  );

export default taskAutomation;
