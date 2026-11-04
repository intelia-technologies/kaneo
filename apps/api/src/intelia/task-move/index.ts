import { requireEntitlement } from "../../billing/require-entitlement-middleware";
import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { initiativeWriter } from "../initiatives/access";
import { moveTaskResultSchema, taskAliasListSchema } from "./response";
import { moveTaskInput, taskIdParam } from "./schema";
import { listTaskAliases, moveTaskWithAlias } from "./service";

const moveTaskRoute = createRoute({
  method: "post",
  operationId: "moveTaskWithAlias",
  path: "/task/{taskId}/move",
  tags: ["Tasks"],
  summary: "Move a task to another project, keeping its identity",
  description:
    "Moves the task to another project of the same workspace in one transaction (Intelia fork). The task keeps its id and everything that hangs from it (comments, reactions, activity, attachments, relations with any project, recurrence, routine, automation level); only its number changes, to the destination's next one, and the old number stays as an alias. The column is mapped by slug, custom fields by name (and type and options), and the initiative by name (created with the same data if the destination lacks it). Anything that cannot be mapped fails with 409 `TASK_MOVE_UNMAPPABLE`, listing every problem, and nothing changes. `dryRun` does it all and rolls it back. A session or an API key with task:update and access to the destination; with an API key, `actor` names who the caller acts for (informative).",
  middleware: [
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: moveTaskInput } },
    },
  },
  responses: {
    200: jsonResponse("What the move did, or would do", moveTaskResultSchema),
    400: errorResponse(
      "Invalid body, the task is already in that project, or `actor` from a session",
    ),
    403: errorResponse(
      "No access to either project, or missing task:update permission",
    ),
    404: errorResponse("Task or destination project not found"),
    409: errorResponse(
      "The destination lacks the task's column, a custom field or an option (`TASK_MOVE_UNMAPPABLE`); nothing changed",
    ),
  },
});

const listAliasesRoute = createRoute({
  method: "get",
  operationId: "listTaskAliases",
  path: "/task/{taskId}/aliases",
  tags: ["Tasks"],
  summary: "Former numbers of a task",
  description:
    "The numbers the task had in the projects it left (Intelia fork), oldest move first. The search and the lookup by ticket id find the task by any of them.",
  middleware: [
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: taskIdParam },
  responses: {
    200: jsonResponse("The task's former numbers", taskAliasListSchema),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Task not found"),
  },
});

const taskMove = apiRouter()
  .openapi(moveTaskRoute, async (c) => {
    const { projectId, dryRun, discardFields, actor } = c.req.valid("json");
    return c.json(
      await moveTaskWithAlias({
        taskId: c.req.valid("param").taskId,
        destinationProjectId: projectId,
        dryRun,
        discardFields,
        writer: initiativeWriter(c, actor),
      }),
      200,
    );
  })
  .openapi(listAliasesRoute, async (c) =>
    c.json(await listTaskAliases(c.req.valid("param").taskId), 200),
  );

export default taskMove;
