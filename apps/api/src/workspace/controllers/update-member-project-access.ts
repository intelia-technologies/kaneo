import { and, eq, inArray, not, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import { getMemberProjectAccess } from "../../project-access/get-member-project-access";
import { publishEvent } from "../../events";
import { keepHiddenGrants } from "../../project-access/keep-hidden-grants";
import { listAccessibleProjectIds } from "../../project-access/list-accessible-project-ids";
import { lockAccessChange } from "../../project-access/lock-access-change";
import { replaceMemberProjectAccess } from "../../project-access/replace-member-project-access";
import type { ProjectAccessMode } from "../../project-access/project-access-mode";
import { resolveProjectAccessRequest } from "../../project-access/resolve-project-access-request";
import { unassignInaccessibleTasks } from "../../project-access/unassign-inaccessible-tasks";
import { assertAssignableUser } from "../../utils/assert-assignable-user";
import { taskIsCompleted } from "../../task/task-is-completed";
import { publishTaskMutation } from "../../task/controllers/task-mutation-effects";

async function updateMemberProjectAccess(request: {
  workspaceId: string;
  actorId: string;
  userId: string;
  projectAccess: ProjectAccessMode;
  projectIds: string[];
  reasignarA?: string;
  operacionId?: string;
}) {
  const { workspaceId, actorId, userId } = request;
  const operacionId = request.operacionId?.toLowerCase();

  if (actorId === userId) {
    throw new HTTPException(403, {
      message: "You can't change your own project access",
    });
  }

  if (request.reasignarA === userId) {
    throw new HTTPException(400, {
      message: "The destination must be a different user",
    });
  }

  const canonicalRequest = JSON.stringify({
    projectAccess: request.projectAccess,
    projectIds: [...new Set(request.projectIds)].sort(),
    reasignarA: request.reasignarA ?? null,
  });
  const result = await db.transaction(async (tx) => {
    if (operacionId) {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([workspaceId, userId, operacionId])}, 0))`,
      );
    }
    const lock = await lockAccessChange(tx, {
      workspaceId,
      actorId,
      userId,
      reasignarA: request.reasignarA,
    });
    if (!lock.actorAllowed) {
      throw new HTTPException(403, { message: "Insufficient permissions" });
    }
    if (operacionId) {
      const stored = await tx.execute<{
        actor_id: string;
        matches: boolean;
        response: {
          userId: string;
          projectAccess: ProjectAccessMode;
          projectIds: string[];
          reasignadas: number;
          desasignadas: number;
        } | null;
      }>(sql`SELECT actor_id, request = ${canonicalRequest}::jsonb AS matches, response
          FROM project_access_operation
          WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
            AND operation_id = ${operacionId}::uuid`);
      if (stored.rows[0]) {
        if (stored.rows[0].actor_id !== actorId) {
          throw new HTTPException(403, {
            message: "Operation belongs to another actor",
          });
        }
        if (stored.rows[0].response === null) {
          throw new ApiError(409, {
            code: "CANCELLED_ACCESS_OPERATION",
            message: "The operation was cancelled",
          });
        }
        if (!stored.rows[0].matches) {
          throw new HTTPException(409, {
            message: "Operation ID already used for a different request",
          });
        }
        return { cached: true as const, response: stored.rows[0].response };
      }
    }
    if (lock.targetRole === null) {
      throw new HTTPException(404, { message: "Member not found" });
    }
    // Project moves take this workspace advisory lock before their project
    // row lock. Hold both through commit so access decisions cannot cross a move.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(1524, hashtext(${workspaceId}))`,
    );
    await tx
      .select({ id: projectTable.id })
      .from(projectTable)
      .where(eq(projectTable.workspaceId, workspaceId))
      .orderBy(projectTable.id)
      .for("update");

    const resolution = await resolveProjectAccessRequest({
      workspaceId,
      actorId,
      targetRole: lock.targetRole,
      projectAccess: request.projectAccess,
      projectIds: request.projectIds,
      database: tx,
    });
    if (!resolution.ok) {
      throw new HTTPException(resolution.status, {
        message: resolution.message,
      });
    }

    const outcome = await keepHiddenGrants({
      workspaceId,
      actorId,
      userId,
      access: resolution.access,
      database: tx,
    });
    if (!outcome.ok) {
      throw new HTTPException(403, { message: outcome.message });
    }

    const before = await listAccessibleProjectIds(tx, workspaceId, userId);
    if (request.operacionId) {
      const current = await getMemberProjectAccess(workspaceId, userId, tx);
      const grantsNewAccess =
        (outcome.access.projectAccess === "all" &&
          current.projectAccess !== "all") ||
        (outcome.access.projectAccess === "selected" &&
          outcome.access.projectIds.some((id) => !before.has(id)));
      if (grantsNewAccess) {
        throw new ApiError(409, {
          code: "STALE_ACCESS_OPERATION",
          message: "The operation would grant project access",
        });
      }
    }
    await replaceMemberProjectAccess(tx, {
      workspaceId,
      userId,
      ...outcome.access,
    });
    const after = await listAccessibleProjectIds(tx, workspaceId, userId);
    const lostProjectIds = [...before].filter(
      (projectId) => !after.has(projectId),
    );
    if (operacionId && lostProjectIds.length > 1) {
      throw new ApiError(409, {
        code: "MULTIPLE_PROJECT_ACCESS_OPERATION",
        message: "An operation may revoke access to at most one project",
      });
    }
    // Bulk task mutations lock rows by id; take the same order before either
    // update so concurrent bulk assignments cannot deadlock on task order.
    await tx
      .select({ id: taskTable.id })
      .from(taskTable)
      .where(
        and(
          eq(taskTable.userId, userId),
          inArray(
            taskTable.projectId,
            tx
              .select({ id: projectTable.id })
              .from(projectTable)
              .where(eq(projectTable.workspaceId, workspaceId)),
          ),
        ),
      )
      .orderBy(taskTable.id)
      .for("update");
    let reassigned: { id: string; projectId: string; title: string }[] = [];
    if (request.reasignarA) {
      await assertAssignableUser(
        request.reasignarA,
        workspaceId,
        lostProjectIds,
        tx,
      );
      if (lostProjectIds.length > 0) {
        reassigned = await tx
          .update(taskTable)
          .set({ userId: request.reasignarA })
          .where(
            and(
              eq(taskTable.userId, userId),
              inArray(taskTable.projectId, lostProjectIds),
              not(taskIsCompleted),
            ),
          )
          .returning({
            id: taskTable.id,
            projectId: taskTable.projectId,
            title: taskTable.title,
          });
      }
    }
    const unassigned = await unassignInaccessibleTasks(tx, {
      workspaceId,
      userId,
      actorId,
      projectIds: operacionId ? lostProjectIds : undefined,
    });
    const response = {
      userId,
      ...resolution.access,
      reasignadas: reassigned.length,
      desasignadas: unassigned.length,
    };
    if (operacionId) {
      await tx.execute(sql`INSERT INTO project_access_operation
          (workspace_id, user_id, actor_id, operation_id, request, response)
          VALUES (${workspaceId}, ${userId}, ${actorId}, ${operacionId}::uuid,
            ${canonicalRequest}::jsonb, ${JSON.stringify(response)}::jsonb)`);
    }
    return {
      cached: false as const,
      response,
      changedProjectIds: [
        ...[...before].filter((projectId) => !after.has(projectId)),
        ...[...after].filter((projectId) => !before.has(projectId)),
      ],
      reassigned,
      unassigned,
    };
  });

  if (result.cached) return result.response;
  const { changedProjectIds, reassigned, unassigned } = result;

  await publishEvent("project_access.updated", {
    workspaceId,
    userId,
    projectIds: changedProjectIds,
  });
  for (const task of reassigned) {
    await publishTaskMutation(
      { ...task, userId },
      { ...task, userId: request.reasignarA },
      actorId,
      { fields: ["userId"] },
    );
  }
  for (const projectId of new Set(unassigned.map((task) => task.projectId))) {
    await publishEvent("task.bulk_unassigned", { projectId, userId: actorId });
  }

  return result.response;
}

export default updateMemberProjectAccess;
