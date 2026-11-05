import { and, eq, inArray, not, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
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
}) {
  const { workspaceId, actorId, userId } = request;

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

  const { access, changedProjectIds, reassigned, unassigned } =
    await db.transaction(async (tx) => {
      const lock = await lockAccessChange(tx, {
        workspaceId,
        actorId,
        userId,
        reasignarA: request.reasignarA,
      });
      if (!lock.actorAllowed) {
        throw new HTTPException(403, { message: "Insufficient permissions" });
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
      await replaceMemberProjectAccess(tx, {
        workspaceId,
        userId,
        ...outcome.access,
      });
      const after = await listAccessibleProjectIds(tx, workspaceId, userId);
      const lostProjectIds = [...before].filter(
        (projectId) => !after.has(projectId),
      );
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
      return {
        access: resolution.access,
        changedProjectIds: [
          ...[...before].filter((projectId) => !after.has(projectId)),
          ...[...after].filter((projectId) => !before.has(projectId)),
        ],
        reassigned,
        unassigned: await unassignInaccessibleTasks(tx, {
          workspaceId,
          userId,
          actorId,
        }),
      };
    });

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

  return {
    userId,
    ...access,
    reasignadas: reassigned.length,
    desasignadas: unassigned.length,
  };
}

export default updateMemberProjectAccess;
