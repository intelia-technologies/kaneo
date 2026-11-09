import { workspaceCapabilities } from "@kaneo/permissions";
import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { validateWorkspaceAccess } from "../../utils/validate-workspace-access";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { priorityTable } from "../schema";

// Design 53 §3.5: the workspace's administrators edit, everyone in it reads.
// "Administrator" is the web's `manageWorkspace` capability (admin and owner
// in the built-in roles), checked against the API key's scope as well.
export const PRIORITY_WRITE_PERMISSION = {
  workspace: [...workspaceCapabilities.manageWorkspace.workspace],
};
export const PRIORITY_READ_PERMISSION = { workspace: ["read"] };

/** Who writes: a person's session or an account's API key. */
export type PriorityWriter = {
  source: "session" | "api_key";
  userId: string;
};

export function priorityWriter(c: Context): PriorityWriter {
  return {
    source: c.get("apiKey") ? "api_key" : "session",
    userId: c.get("userId"),
  };
}

/** Who reads: the caller and the workspace its request resolved to. */
export type PriorityReader = { userId: string; workspaceId: string };

export function priorityReader(c: Context): PriorityReader {
  return { userId: c.get("userId"), workspaceId: c.get("workspaceId") };
}

// Workspace access from the priority in the path, the way upstream's lookups
// resolve a task or a project.
function fromPriorityId() {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId");
    if (!userId) throw new HTTPException(401, { message: "Unauthorized" });
    const id = c.req.param("priorityId");
    const notFoundMessage = "Priority not found";
    const [scope] = id
      ? await db
          .select({ workspaceId: priorityTable.workspaceId })
          .from(priorityTable)
          .where(eq(priorityTable.id, id))
          .limit(1)
      : [];
    if (!scope) throw new HTTPException(404, { message: notFoundMessage });
    await validateWorkspaceAccess(
      userId,
      scope.workspaceId,
      c.get("apiKey")?.id,
      { notFoundMessage },
    );
    c.set("workspaceId", scope.workspaceId);
    return next();
  };
}

export const priorityAccess = {
  readOnWorkspace: () => [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission(PRIORITY_READ_PERMISSION),
  ],
  writeOnWorkspace: () => [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission(PRIORITY_WRITE_PERMISSION),
  ],
  // Includes the caller's access to the project, as every project read.
  readOnProject: () => [
    workspaceAccess.fromProjectId("projectId"),
    requireWorkspacePermission(PRIORITY_READ_PERMISSION),
  ],
  readOnPriority: () => [
    fromPriorityId(),
    requireWorkspacePermission(PRIORITY_READ_PERMISSION),
  ],
  writeOnPriority: () => [
    fromPriorityId(),
    requireWorkspacePermission(PRIORITY_WRITE_PERMISSION),
  ],
};
