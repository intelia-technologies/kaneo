import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../../database";
import { validateWorkspaceAccess } from "../../utils/validate-workspace-access";

// The workspace of the task in the path, without asking for access to its
// project: the requester follows a task of a project they cannot open. Only
// the requester routes use it; the handler (read.ts) then checks that the
// caller is the requester or can open the project.
export function workspaceFromRequestedTask(idKey = "taskId") {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId");
    if (!userId) throw new HTTPException(401, { message: "Unauthorized" });
    const id = c.req.param(idKey);
    const notFoundMessage = "Request not found";
    const [scope] = id
      ? await db
          .select({ workspaceId: schema.projectTable.workspaceId })
          .from(schema.taskTable)
          .innerJoin(
            schema.projectTable,
            eq(schema.taskTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.taskTable.id, id))
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
