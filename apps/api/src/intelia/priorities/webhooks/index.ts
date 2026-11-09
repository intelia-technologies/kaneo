import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../../openapi";
import { priorityAccess } from "../access";
import { PRIORITY_CHANGED_EVENT } from "../event";
import { workspaceIdParam } from "../schema";
import {
  createPriorityWebhookInput,
  priorityWebhookIdParam,
  priorityWebhookListSchema,
  priorityWebhookSchema,
} from "./schema";
import {
  createPriorityWebhook,
  deletePriorityWebhook,
  listPriorityWebhooks,
} from "./service";

const tags = ["Priorities"];

const ADMINS = `Workspace administrators only (workspace:update and workspace:manage_settings, also in an API key's scope). These are the only destinations of \`${PRIORITY_CHANGED_EVENT}\`: the projects' webhooks never receive it.`;

const errors = {
  401: errorResponse("No session or API key"),
  403: errorResponse("Not an administrator of the workspace"),
};

const listRouteDef = createRoute({
  method: "get",
  operationId: "listPriorityWebhooks",
  path: "/workspace/{workspaceId}/priority-webhooks",
  tags,
  summary: "List the destinations of priority events",
  description: `Without their secrets. ${ADMINS}`,
  middleware: priorityAccess.writeOnWorkspace(),
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse("The destinations", priorityWebhookListSchema),
    ...errors,
    404: errorResponse("Workspace not found"),
  },
});

const createRouteDef = createRoute({
  method: "post",
  operationId: "createPriorityWebhook",
  path: "/workspace/{workspaceId}/priority-webhooks",
  tags,
  summary: "Send priority events to a destination",
  description: `Every change of the workspace's priorities is POSTed there from now on. ${ADMINS}`,
  middleware: priorityAccess.writeOnWorkspace(),
  request: {
    params: workspaceIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: createPriorityWebhookInput } },
    },
  },
  responses: {
    201: jsonResponse("The destination", priorityWebhookSchema),
    400: errorResponse(
      "Invalid body, or a private destination (PRIORITY_WEBHOOK_DESTINATION)",
    ),
    ...errors,
    404: errorResponse("Workspace not found"),
    409: errorResponse(
      "The workspace already sends priorities to that URL (PRIORITY_WEBHOOK_TAKEN)",
    ),
  },
});

const deleteRouteDef = createRoute({
  method: "delete",
  operationId: "deletePriorityWebhook",
  path: "/workspace/{workspaceId}/priority-webhooks/{priorityWebhookId}",
  tags,
  summary: "Stop sending priority events to a destination",
  description: ADMINS,
  middleware: priorityAccess.writeOnWorkspace(),
  request: { params: workspaceIdParam.extend(priorityWebhookIdParam.shape) },
  responses: {
    200: jsonResponse("The removed destination", priorityWebhookSchema),
    ...errors,
    404: errorResponse("Workspace or destination not found"),
  },
});

const priorityWebhooks = apiRouter()
  .openapi(listRouteDef, async (c) =>
    c.json(await listPriorityWebhooks(c.req.valid("param").workspaceId), 200),
  )
  .openapi(createRouteDef, async (c) =>
    c.json(
      await createPriorityWebhook(
        c.req.valid("param").workspaceId,
        c.req.valid("json"),
        c.get("userId"),
      ),
      201,
    ),
  )
  .openapi(deleteRouteDef, async (c) => {
    const { workspaceId, priorityWebhookId } = c.req.valid("param");
    return c.json(
      await deletePriorityWebhook(workspaceId, priorityWebhookId),
      200,
    );
  });

export default priorityWebhooks;
