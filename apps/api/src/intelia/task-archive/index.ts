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
  archiveTasksResultSchema,
  unarchiveTasksResultSchema,
} from "./response";
import { archiveTasksInput } from "./schema";
import { archiveTasks, unarchiveTasks } from "./service";

const body = {
  required: true,
  content: { "application/json": { schema: archiveTasksInput } },
};

const archiveRoute = createRoute({
  method: "post",
  operationId: "archiveTasks",
  path: "/tasks/archive",
  tags: ["Tasks"],
  summary: "Archive closed tasks in bulk",
  description:
    "Marks up to 100 tasks of one workspace as archived, in one transaction (Intelia fork, design 53 §3.2). Archiving is a mark apart from the status: the task stays in its done or cancelled column, so dependencies, initiatives and the critical path count it as before. The board and the listings leave archived tasks out unless asked (`archived` on the board); the task detail and the search still return them, with `archivedAt`. Idempotent: an archived task keeps its first `archivedAt`. Only tasks in a final column can be archived: any other fails the whole call with 409 `TASK_NOT_CLOSED`. A task that leaves its final column later loses the mark.",
  middleware: [
    workspaceAccess.fromTasks(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: { body },
  responses: {
    200: jsonResponse("The archived tasks", archiveTasksResultSchema),
    400: errorResponse(
      "Invalid body (from 1 to 100 ids), or the tasks span more than one workspace",
    ),
    401: errorResponse("No session or API key"),
    403: errorResponse("No access to a project, or missing task:update"),
    404: errorResponse("Some of the tasks were not found"),
    409: errorResponse(
      "A task is not in a final column (`TASK_NOT_CLOSED`); nothing was archived",
    ),
  },
});

const unarchiveRoute = createRoute({
  method: "post",
  operationId: "unarchiveTasks",
  path: "/tasks/unarchive",
  tags: ["Tasks"],
  summary: "Unarchive tasks in bulk",
  description:
    "Removes the archive mark from up to 100 tasks of one workspace (Intelia fork). Their status does not change. Tasks without the mark are left alone.",
  middleware: [
    workspaceAccess.fromTasks(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: { body },
  responses: {
    200: jsonResponse("The unarchived tasks", unarchiveTasksResultSchema),
    400: errorResponse(
      "Invalid body (from 1 to 100 ids), or the tasks span more than one workspace",
    ),
    401: errorResponse("No session or API key"),
    403: errorResponse("No access to a project, or missing task:update"),
    404: errorResponse("Some of the tasks were not found"),
  },
});

const taskArchive = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(archiveRoute, async (c) =>
    c.json(
      await archiveTasks(c.req.valid("json").taskIds, {
        userId: c.get("userId"),
        workspaceId: c.get("workspaceId"),
      }),
      200,
    ),
  )
  .openapi(unarchiveRoute, async (c) =>
    c.json(
      await unarchiveTasks(c.req.valid("json").taskIds, {
        userId: c.get("userId"),
        workspaceId: c.get("workspaceId"),
      }),
      200,
    ),
  );

export default taskArchive;
