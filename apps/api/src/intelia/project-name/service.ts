import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";

// Writes only `name`: upstream's PUT /project/{id} replaces every field and
// rejects the null description most API-created projects have.
export async function renameProject(
  id: string,
  workspaceId: string,
  name: string,
) {
  const [project] = await db
    .update(projectTable)
    .set({ name })
    .where(
      and(eq(projectTable.id, id), eq(projectTable.workspaceId, workspaceId)),
    )
    .returning();
  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }
  return project;
}
