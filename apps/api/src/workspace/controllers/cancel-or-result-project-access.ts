import { sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { lockAccessChange } from "../../project-access/lock-access-change";

export async function cancelOrResultProjectAccess(request: {
  workspaceId: string;
  userId: string;
  actorId: string;
  operacionId: string;
}) {
  const { workspaceId, userId, actorId } = request;
  const operacionId = request.operacionId.toLowerCase();
  if (actorId === userId) {
    throw new HTTPException(403, {
      message: "You can't change your own project access",
    });
  }
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([workspaceId, userId, operacionId])}, 0))`,
    );
    const lock = await lockAccessChange(tx, { workspaceId, actorId, userId });
    if (!lock.actorAllowed) {
      throw new HTTPException(403, { message: "Insufficient permissions" });
    }
    const stored = await tx.execute<{
      actor_id: string;
      response: { reasignadas: number; desasignadas: number } | null;
    }>(sql`SELECT actor_id, response FROM intelia.project_access_operation
      WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
        AND operation_id = ${operacionId}::uuid`);
    if (stored.rows[0] && stored.rows[0].actor_id !== actorId) {
      throw new HTTPException(403, {
        message: "Operation belongs to another actor",
      });
    }
    if (stored.rows[0]?.response) {
      const { reasignadas, desasignadas } = stored.rows[0].response;
      return { estado: "aplicada" as const, reasignadas, desasignadas };
    }
    if (!stored.rows[0]) {
      await tx.execute(sql`INSERT INTO intelia.project_access_operation
        (workspace_id, user_id, actor_id, operation_id, request, response)
        VALUES (${workspaceId}, ${userId}, ${actorId}, ${operacionId}::uuid, NULL, NULL)`);
    }
    return { estado: "cancelada" as const };
  });
}
