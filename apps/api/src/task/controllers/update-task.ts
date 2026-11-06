import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  columnTable,
  projectTable,
  taskTable,
  userTable,
  workspaceUserTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import {
  publishTaskMutation,
  recordTaskMutation,
} from "./task-mutation-effects";
import {
  assertAssignableUser,
  getProjectWorkspaceId,
} from "../../utils/assert-assignable-user";
import { hasInstanceAdminRole } from "../../utils/instance-admin-role";
import { roleHasWorkspacePermission } from "../../utils/require-workspace-permission";
import { boardDescription, descriptionDeferred } from "../description-pages";
import { assertValidTaskStatus } from "../validate-task-fields";
import { assertTaskPosition } from "./next-task-position";
import { assertNoPendingBlockersOnTransition } from "./assert-no-pending-blockers-on-transition";

async function updateTask(
  id: string,
  title: string,
  status: string,
  startDate: Date | undefined,
  dueDate: Date | undefined,
  projectId: string,
  description: string | undefined,
  priority: string,
  position: number,
  userId?: string,
  currentUserId?: string,
  estimacion_horas?: number | null,
  canAssign = false,
  authorizedWorkspaceId?: string,
) {
  assertTaskPosition(position);

  let [existingTask] = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      priority: taskTable.priority,
      userId: taskTable.userId,
      dueDate: taskTable.dueDate,
      description:
        description === undefined ? sql<null>`null` : taskTable.description,
      status: taskTable.status,
      position: taskTable.position,
      projectId: taskTable.projectId,
    })
    .from(taskTable)
    .where(eq(taskTable.id, id))
    .limit(1);

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  if (projectId !== existingTask.projectId) {
    throw new HTTPException(400, {
      message: "Use the task move endpoint to move tasks between projects",
    });
  }

  await assertValidTaskStatus(status, projectId);

  const normalizedUserId = userId?.trim() || undefined;

  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.projectId, projectId),
      eq(columnTable.slug, status),
    ),
  });

  const initialPosition = existingTask.position;
  const initialStatus = existingTask.status;
  const initialAssignee = existingTask.userId;
  const workspaceId =
    authorizedWorkspaceId ?? (await getProjectWorkspaceId(projectId));
  const updatedTask = await db.transaction(async (tx) => {
    const memberships =
      userId !== undefined
        ? await tx
            .select({
              userId: workspaceUserTable.userId,
              role: workspaceUserTable.role,
            })
            .from(workspaceUserTable)
            .where(
              and(
                eq(workspaceUserTable.workspaceId, workspaceId),
                inArray(
                  workspaceUserTable.userId,
                  [currentUserId, normalizedUserId].filter(
                    (id): id is string => !!id,
                  ),
                ),
              ),
            )
            .orderBy(workspaceUserTable.id)
            .for("update")
        : [];
    const [project] = await tx
      .select({ id: projectTable.id, workspaceId: projectTable.workspaceId })
      .from(projectTable)
      .where(eq(projectTable.id, projectId))
      .for("update");
    if (!project)
      throw new HTTPException(404, { message: "Project not found" });
    if (project.workspaceId !== workspaceId)
      throw new HTTPException(409, {
        message: "Project changed workspaces; retry the update",
      });
    const [locked] = await tx
      .select({
        id: taskTable.id,
        title: taskTable.title,
        priority: taskTable.priority,
        userId: taskTable.userId,
        dueDate: taskTable.dueDate,
        description:
          description === undefined ? sql<null>`null` : taskTable.description,
        status: taskTable.status,
        columnId: taskTable.columnId,
        position: taskTable.position,
        projectId: taskTable.projectId,
      })
      .from(taskTable)
      .where(and(eq(taskTable.id, id), eq(taskTable.projectId, projectId)))
      .for("update");
    if (!locked)
      throw new HTTPException(409, {
        message: "Task changed projects; retry the update",
      });
    if (locked.position !== initialPosition || locked.status !== initialStatus)
      throw new HTTPException(409, {
        message: "Task order changed; refresh before updating",
      });
    if (userId !== undefined && (normalizedUserId ?? null) !== locked.userId) {
      const actorRole = memberships.find(
        (member) => member.userId === currentUserId,
      )?.role;
      let allowed =
        canAssign &&
        !!workspaceId &&
        !!actorRole &&
        (await roleHasWorkspacePermission(
          workspaceId,
          actorRole,
          { task: ["assign"] },
          tx,
        ));
      if (canAssign && !allowed && currentUserId) {
        const [actor] = await tx
          .select({ role: userTable.role })
          .from(userTable)
          .where(eq(userTable.id, currentUserId))
          .limit(1);
        allowed = hasInstanceAdminRole(actor?.role);
      }
      if (!allowed)
        throw new HTTPException(403, {
          message: "Insufficient permissions to assign tasks",
        });
    }
    if (
      userId !== undefined &&
      (normalizedUserId ?? null) === initialAssignee &&
      locked.userId !== initialAssignee
    ) {
      throw new HTTPException(409, {
        message: "Task assignee changed; refresh before updating",
      });
    }
    if (normalizedUserId && normalizedUserId !== locked.userId) {
      await assertAssignableUser(normalizedUserId, workspaceId!, projectId, tx);
    }
    await assertNoPendingBlockersOnTransition(tx, [locked], status);
    existingTask = locked;

    const [task] = await tx
      .update(taskTable)
      .set({
        title,
        status,
        columnId: column?.id ?? null,
        startDate: startDate || null,
        dueDate: dueDate || null,
        estimacion_horas,
        projectId,
        description,
        priority,
        position,
        userId:
          userId === undefined ? locked.userId : (normalizedUserId ?? null),
      })
      .where(and(eq(taskTable.id, id), eq(taskTable.projectId, projectId)))
      .returning({
        ...getTableColumns(taskTable),
        description: boardDescription,
        descriptionDeferred,
      });
    if (task)
      await recordTaskMutation(
        tx,
        existingTask,
        { title, dueDate: dueDate ?? null },
        currentUserId,
      );
    return task;
  });

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: "Failed to update task",
    });
  }

  await publishTaskMutation(
    {
      ...existingTask,
      description:
        description === undefined ? undefined : existingTask.description,
    },
    { ...updatedTask, description: description ?? updatedTask.description },
    currentUserId,
  );

  await publishEvent("task.updated", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    title: updatedTask.title,
    status: updatedTask.status,
    userId: currentUserId,
  });

  return updatedTask;
}

export default updateTask;
