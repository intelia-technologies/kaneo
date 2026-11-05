import { ApiError } from "../../errors/api-error";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import {
  boardSignalsSchema,
  projectIdParam,
  putBoardSignalsInput,
} from "./schema";
import { getBoardSignals, putBoardSignals } from "./service";

const getBoardSignalsRoute = createRoute({
  method: "get",
  operationId: "getProjectBoardSignals",
  path: "/project/{projectId}/board-signals",
  tags: ["Tasks"],
  summary: "Get project board signals",
  description:
    "What the factory last reported about the project's open tasks for the cards: the mean stay of each column, alarms, waits and workers. Empty if it never reported. The same access as listing the project's tasks.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["read"], task: ["read"] }),
  ] as const,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse("The project's board signals", boardSignalsSchema),
    403: errorResponse("No access to the project, or missing read permission"),
    404: errorResponse("Project not found"),
  },
});

const putBoardSignalsRoute = createRoute({
  method: "put",
  operationId: "putProjectBoardSignals",
  path: "/project/{projectId}/board-signals",
  tags: ["Tasks"],
  summary: "Replace project board signals",
  description:
    "Replaces the project's board signals. Written by the factory's dispatcher on every board review (design 32, RT-05) with its API key and task:update; a person's session cannot write them. Kaneo stores them as given and never calls the factory.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["read"], task: ["update"] }),
  ] as const,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: putBoardSignalsInput } },
    },
  },
  responses: {
    200: jsonResponse("The stored board signals", boardSignalsSchema),
    400: errorResponse("Invalid signals"),
    403: errorResponse(
      "No access to the project, missing task:update, or a session instead of an API key",
    ),
    404: errorResponse("Project not found"),
  },
});

const boardSignals = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(getBoardSignalsRoute, async (c) =>
    c.json(await getBoardSignals(c.req.valid("param").projectId), 200),
  )
  .openapi(putBoardSignalsRoute, async (c) => {
    if (!c.get("apiKey")) {
      throw new ApiError(403, {
        message: "Board signals are written with an API key, not a session",
        code: "FORBIDDEN",
      });
    }
    return c.json(
      await putBoardSignals(
        c.req.valid("param").projectId,
        c.req.valid("json"),
        c.get("userId"),
      ),
      200,
    );
  });

export default boardSignals;
