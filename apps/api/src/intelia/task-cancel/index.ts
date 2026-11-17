import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { HTTPException } from "hono/http-exception";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { initiativeWriter } from "../initiatives/access";
import { cancelResultSchema, dependenciesErrorSchema } from "./response";
import { cancelTaskInput, taskIdParam } from "./schema";
import { cancelTask } from "./service";

const cancelRoute = createRoute({
  method: "post",
  operationId: "cancelTaskWithDependents",
  path: "/task/{taskId}/cancel",
  tags: ["Tasks"],
  summary: "Cancel a task deciding what happens to its dependents",
  description:
    "Cancels the task and, in the same transaction, applies `resoluciones` to every open task hanging from it (design 82 §4.3): `cancelar` (cancelled too, then its own dependents are decided), `quitar` (the dependency goes, the task stays) or `mover` (the dependency passes to task `a`). Dependents of other projects are not decided: their dependency is removed, their automation turned off with a `pausaMotivo`, and they get a comment naming their owner. Every task cancelled has its routine paused, and every task touched gets a comment signed with `firma`. Without open dependents it cancels as before (with a comment if `motivo` comes); a task already cancelled stays as it is (200, nothing written). With open dependents the resolutions must cover the chain exactly and bring a `motivo`, or 409 `DEPENDENCIAS_SIN_RESOLVER` with the chain, what is pending and what is wrong, and nothing changes; a chain that changed meanwhile gives `cadena_cambiada`. While `INTELIA_CANCEL_GUARD` is off, a call without `resoluciones` cancels as before even with dependents. Afterwards: `task.status_changed` per cancelled task, the relation and automation events, and `intelia.task.cancelled_with_dependents`.",
  middleware: [
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: cancelTaskInput } },
    },
  },
  responses: {
    200: jsonResponse(
      "What was cancelled, released, moved and touched",
      cancelResultSchema,
    ),
    400: errorResponse("Invalid body, or `actor` from a session"),
    403: errorResponse(
      "No access to the project, missing task:update, or `firma` without workspace:manage_settings",
    ),
    404: errorResponse("Task not found"),
    409: jsonResponse(
      "Open dependents without a complete resolution or a `motivo` (`DEPENDENCIAS_SIN_RESOLVER`); nothing changed",
      dependenciesErrorSchema,
    ),
  },
});

const taskCancel = apiRouter<BaseVariables & { workspaceId: string }>().openapi(
  cancelRoute,
  async (c) => {
    const input = c.req.valid("json");
    const writer = initiativeWriter(c, input.actor);
    // Signing as someone else is importing an external author: the same
    // permission the comment route asks for.
    if (
      input.firma &&
      !(await hasWorkspacePermission(c, { workspace: ["manage_settings"] }))
    )
      throw new HTTPException(403, {
        message: "`firma` requires workspace:manage_settings permission",
      });
    return c.json(
      await cancelTask({
        taskId: c.req.valid("param").taskId,
        workspaceId: c.get("workspaceId"),
        userId: c.get("userId"),
        userName: c.get("user")?.name ?? null,
        writer,
        input,
      }),
      200,
    );
  },
);

export default taskCancel;
