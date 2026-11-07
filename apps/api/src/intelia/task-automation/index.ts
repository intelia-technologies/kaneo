import type { Context } from "hono";
import { ApiError } from "../../errors/api-error";
import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
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

const getAutomationRoute = createRoute({
  method: "get",
  operationId: "getTaskAutomation",
  path: "/task/{taskId}/automation",
  tags: ["Task Automation"],
  summary: "Get task automation level",
  description:
    "The task's automation (design 48 §3.2: `automatica`, `pausaMotivo`, verification, `entrega`, roles and `columnaPrevia`, plus the former level), with who set it and when.",
  middleware: [
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["read"] }),
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
    "Change any subset of the task's automation; what is omitted stays and null clears an optional field. Changes of `automatica`, `pausaMotivo`, verification, `entrega` or the level go to the change log and out as `task.automation_changed`; the roles and `columnaPrevia` are stored without either. `automatica` and the level are tied (manual is no); `pausaMotivo` only with `automatica: false`, and it clears when `automatica` changes. The first write needs the verification and `automatica` or `level`. A person's session or an account's API key, with task:update. Kaneo does not check who may change it beyond that: the factory's gateway does, before calling (design 18 §5). With an API key, `actor` names who the caller acts for (informative, logged as given). `completa` requires verification.",
  middleware: [
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["update"] }),
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
      "Invalid level, `completa` without verification, or `actor` from a session",
    ),
    403: errorResponse("No access to the project or missing task:update"),
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
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["read"] }),
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
    "The automation of every task in the project that has one (the same fields as a task's, camelCase), by task number. Tasks without one are absent.",
  middleware: [
    workspaceAccess.fromProjectId("projectId"),
    requireWorkspacePermission({ project: ["read"], task: ["read"] }),
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

// An API key writes as its account, with the actor the caller declares (an
// invalid one is already dropped by the body schema); a session acts as its
// own user.
function writer(c: Context, actor: string | undefined): AutomationWriter {
  if (c.get("apiKey")) {
    return { source: "api_key", userId: c.get("userId"), actor: actor ?? null };
  }
  if (actor) {
    throw new ApiError(400, {
      message: "`actor` is only for API keys; a session acts as its user",
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
    const { actor, ...patch } = c.req.valid("json");
    return c.json(
      await setAutomation(c.req.valid("param").taskId, patch, writer(c, actor)),
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
