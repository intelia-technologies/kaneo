import { eq, sql } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { assertProjectAccess } from "../../project-access/assert-project-access";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { validateWorkspaceAccess } from "../../utils/validate-workspace-access";
import {
  INITIATIVE_READ_PERMISSION,
  INITIATIVE_WRITE_PERMISSION,
} from "../initiatives/access";
import { initiativeTable, scopePauseTable } from "../schema";

// Workspace and home-project access from the pause in the path. Middleware
// runs before the validators, so it reads the raw path parameter.
function fromPauseId() {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId");
    if (!userId) throw new HTTPException(401, { message: "Unauthorized" });
    const id = c.req.param("pauseId");
    const [scope] = id
      ? await db
          .select({
            workspaceId: projectTable.workspaceId,
            projectId: projectTable.id,
          })
          .from(scopePauseTable)
          .leftJoin(
            initiativeTable,
            eq(initiativeTable.id, scopePauseTable.initiativeId),
          )
          .innerJoin(
            projectTable,
            eq(
              projectTable.id,
              sql`coalesce(${scopePauseTable.projectId}, ${initiativeTable.projectId})`,
            ),
          )
          .where(eq(scopePauseTable.id, id))
          .limit(1)
      : [];
    const notFoundMessage = "Pause not found";
    if (!scope) throw new HTTPException(404, { message: notFoundMessage });
    await validateWorkspaceAccess(
      userId,
      scope.workspaceId,
      c.get("apiKey")?.id,
      { notFoundMessage },
    );
    await assertProjectAccess(userId, [scope.projectId]);
    c.set("workspaceId", scope.workspaceId);
    return next();
  };
}

// Same rule as initiatives (design 81 §3.3): task:update on the home project
// to write, task:read to read. Who may pause is checked by the gateway against
// the graph (`can_pause`) before calling.
export const pauseAccess = {
  writeOnPause: () => [
    fromPauseId(),
    requireWorkspacePermission(INITIATIVE_WRITE_PERMISSION),
  ],
  readOnPause: () => [
    fromPauseId(),
    requireWorkspacePermission(INITIATIVE_READ_PERMISSION),
  ],
};
