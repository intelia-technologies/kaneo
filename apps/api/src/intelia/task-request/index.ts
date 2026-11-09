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
import { initiativeWriter } from "../initiatives/access";
import { workspaceFromRequestedTask } from "./access";
import { addRequestComment, getRequestDetail, listMyRequests } from "./read";
import {
  requestDetailSchema,
  requestListSchema,
  taskRequesterSchema,
} from "./response";
import {
  rejectRequestInput,
  requestCommentInput,
  setRequesterInput,
  taskIdParam,
  workspaceIdParam,
} from "./schema";
import {
  clearTaskRequester,
  getTaskRequester,
  rejectTaskRequest,
  setTaskRequester,
} from "./service";

const nullableRequester = taskRequesterSchema.nullable();

const getRequesterRoute = createRoute({
  method: "get",
  operationId: "getTaskRequester",
  path: "/task/{taskId}/requester",
  tags: ["Requests"],
  summary: "Requester of a task",
  description:
    "Who asked for the task (design 52 §3.2), or null. For members of the task's project.",
  middleware: [
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: taskIdParam },
  responses: {
    200: jsonResponse("The requester, or null", nullableRequester),
    403: errorResponse("No access to the project or missing task:read"),
    404: errorResponse("Task not found"),
  },
});

const setRequesterRoute = createRoute({
  method: "put",
  operationId: "setTaskRequester",
  path: "/task/{taskId}/requester",
  tags: ["Requests"],
  summary: "Set the requester of a task",
  description:
    "Records who asked for the task. The requester must be a member of the workspace but needs no access to the project: they can read and comment on this task only (`GET /request/{taskId}`, `POST /request/{taskId}/comments`) until it reaches a cancelled column. Replaces any previous requester.",
  middleware: [
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: setRequesterInput } },
    },
  },
  responses: {
    200: jsonResponse("The requester", taskRequesterSchema),
    400: errorResponse(
      "Invalid body, `actor` from a session, or the requester is not a workspace member (`REQUESTER_NOT_MEMBER`)",
    ),
    403: errorResponse("No access to the project or missing task:update"),
    404: errorResponse("Task not found"),
    409: errorResponse("The task is cancelled (`TASK_CANCELLED`)"),
  },
});

const clearRequesterRoute = createRoute({
  method: "delete",
  operationId: "clearTaskRequester",
  path: "/task/{taskId}/requester",
  tags: ["Requests"],
  summary: "Remove the requester of a task",
  description:
    "Removes the requester and, with it, their access to the task. Idempotent.",
  middleware: [
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: { params: taskIdParam },
  responses: {
    200: jsonResponse("No requester", z.null()),
    403: errorResponse("No access to the project or missing task:update"),
    404: errorResponse("Task not found"),
  },
});

const rejectRoute = createRoute({
  method: "post",
  operationId: "rejectTaskRequest",
  path: "/task/{taskId}/reject",
  tags: ["Requests"],
  summary: "Reject a requested task",
  description:
    "Moves a task in «Pedida» to its project's cancelled column. The requester loses access and gets a notice (`task_request_closed`) with the reason. Cancelling the task any other way closes the request too, with no reason.",
  middleware: [
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: rejectRequestInput } },
    },
  },
  responses: {
    200: jsonResponse("The closed request", taskRequesterSchema),
    400: errorResponse("Invalid body"),
    403: errorResponse("No access to the project or missing task:update"),
    404: errorResponse("Task not found"),
    409: errorResponse(
      "The task has no requester (`TASK_NOT_REQUESTED`), is not in «Pedida» (`TASK_NOT_PENDING_REQUEST`) or its project has no cancelled column (`NO_CANCELLED_COLUMN`)",
    ),
  },
});

const getRequestRoute = createRoute({
  method: "get",
  operationId: "getRequest",
  path: "/request/{taskId}",
  tags: ["Requests"],
  summary: "A task the caller asked for",
  description:
    "The task and its comments, for its requester, who needs no access to the project, or for a member of the project. The requester loses it when the task reaches a cancelled column or its project is archived: then, like a task of somebody else's request, 404.",
  middleware: [
    workspaceFromRequestedTask("taskId"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: taskIdParam },
  responses: {
    200: jsonResponse("The request", requestDetailSchema),
    403: errorResponse("Missing task:read"),
    404: errorResponse("Not a request the caller may follow"),
  },
});

const commentRequestRoute = createRoute({
  method: "post",
  operationId: "commentRequest",
  path: "/request/{taskId}/comments",
  tags: ["Requests"],
  summary: "Comment on a task the caller asked for",
  description:
    "Adds a comment to the task, with the same access as `GET /request/{taskId}`. The requester can only comment: moving the task or changing its fields still needs access to the project.",
  middleware: [
    workspaceFromRequestedTask("taskId"),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: requestCommentInput } },
    },
  },
  responses: {
    200: jsonResponse("The request with the new comment", requestDetailSchema),
    400: errorResponse("Invalid body"),
    403: errorResponse("Missing task:update"),
    404: errorResponse("Not a request the caller may follow"),
  },
});

const listMyRequestsRoute = createRoute({
  method: "get",
  operationId: "listMyRequests",
  path: "/workspace/{workspaceId}/requests",
  tags: ["Requests"],
  summary: "What I have asked for",
  description:
    "The caller's open requests in the workspace, in any project, newest first. Cancelled ones and those of archived projects are left out: their requester no longer has access.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse("The caller's requests", requestListSchema),
    403: errorResponse("Missing task:read"),
    404: errorResponse("Workspace not found or not a member"),
  },
});

const taskRequest = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(getRequesterRoute, async (c) =>
    c.json(await getTaskRequester(c.req.valid("param").taskId), 200),
  )
  .openapi(setRequesterRoute, async (c) => {
    const { userId, actor } = c.req.valid("json");
    const writer = initiativeWriter(c, actor);
    const requester = await setTaskRequester(
      c.req.valid("param").taskId,
      userId,
      {
        userId: writer.userId,
        actor: writer.source === "api_key" ? writer.actor : null,
      },
    );
    return c.json(requester!, 200);
  })
  .openapi(clearRequesterRoute, async (c) => {
    await clearTaskRequester(c.req.valid("param").taskId);
    return c.json(null, 200);
  })
  .openapi(rejectRoute, async (c) => {
    const closed = await rejectTaskRequest(
      c.req.valid("param").taskId,
      c.req.valid("json").reason,
      c.get("userId"),
    );
    return c.json(closed!, 200);
  })
  .openapi(getRequestRoute, async (c) =>
    c.json(
      await getRequestDetail(
        c.req.valid("param").taskId,
        c.get("userId"),
        c.get("workspaceId"),
      ),
      200,
    ),
  )
  .openapi(commentRequestRoute, async (c) =>
    c.json(
      await addRequestComment(
        c.req.valid("param").taskId,
        c.get("userId"),
        c.get("workspaceId"),
        c.req.valid("json").content,
      ),
      200,
    ),
  )
  .openapi(listMyRequestsRoute, async (c) =>
    c.json(await listMyRequests(c.get("userId"), c.get("workspaceId")), 200),
  );

export default taskRequest;
