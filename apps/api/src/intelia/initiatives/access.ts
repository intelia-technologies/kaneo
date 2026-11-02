import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../../database";
import { ApiError } from "../../errors/api-error";
import { assertProjectAccess } from "../../project-access/assert-project-access";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { validateWorkspaceAccess } from "../../utils/validate-workspace-access";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { initiativeTable } from "../schema";

/**
 * Who writes an initiative or a task's membership: a person's session or an
 * account's API key, with the actor its caller declares (informative).
 */
export type InitiativeWriter =
  | { source: "session"; userId: string }
  | { source: "api_key"; userId: string; actor: string | null };

// Every write of initiatives, in one place (design 19 §3, with the contract of
// AU-02c): a session or an API key of an account with task:update in the
// workspace (and in the key's scope). Kaneo does not consult the graph: the
// factory's gateway checks the finer rule before calling. There is no service
// token. Reads need task:read.
export const INITIATIVE_WRITE_PERMISSION = { task: ["update"] };
export const INITIATIVE_READ_PERMISSION = { task: ["read"] };

/** The writer of a request that passed the write middleware. */
export function initiativeWriter(
  c: Context,
  actor: string | undefined,
): InitiativeWriter {
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

/** Whoever makes the request, without a declared actor (task creation). */
export function callerInitiativeWriter(c: Context): InitiativeWriter {
  return initiativeWriter(c, undefined);
}

// Workspace and project access from the initiative in the path, the way
// upstream's lookups resolve a task or a project.
function fromInitiativeId(idKey = "initiativeId") {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId");
    if (!userId) throw new HTTPException(401, { message: "Unauthorized" });
    const id = c.req.param(idKey);
    const [scope] = id
      ? await db
          .select({
            workspaceId: schema.projectTable.workspaceId,
            projectId: schema.projectTable.id,
          })
          .from(initiativeTable)
          .innerJoin(
            schema.projectTable,
            eq(initiativeTable.projectId, schema.projectTable.id),
          )
          .where(eq(initiativeTable.id, id))
          .limit(1)
      : [];
    const notFoundMessage = "Initiative not found";
    if (!scope) throw new HTTPException(404, { message: notFoundMessage });
    await validateWorkspaceAccess(
      userId,
      scope.workspaceId,
      c.get("apiKey")?.id,
      {
        notFoundMessage,
      },
    );
    await assertProjectAccess(userId, [scope.projectId]);
    c.set("workspaceId", scope.workspaceId);
    return next();
  };
}

export const initiativeAccess = {
  writeOnProject: () => [
    workspaceAccess.fromProjectId("projectId"),
    requireWorkspacePermission(INITIATIVE_WRITE_PERMISSION),
  ],
  writeOnInitiative: () => [
    fromInitiativeId(),
    requireWorkspacePermission(INITIATIVE_WRITE_PERMISSION),
  ],
  readOnInitiative: () => [
    fromInitiativeId(),
    requireWorkspacePermission(INITIATIVE_READ_PERMISSION),
  ],
  writeOnTask: () => [
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission(INITIATIVE_WRITE_PERMISSION),
  ],
  readOnTask: () => [
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission(INITIATIVE_READ_PERMISSION),
  ],
};
