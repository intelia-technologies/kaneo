import { and, asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  taskArchiveTable,
  taskClassificationTable,
} from "../../intelia/schema";
import { ApiError } from "../../errors/api-error";
import { archiveColumn } from "../../intelia/task-archive/archive-column";
import { ARCHIVED_STATUS } from "../../intelia/task-archive/archive-status";
import { announceArchived } from "../../intelia/task-archive/service";
import { columnTable, projectTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { filterUsersWithProjectAccess } from "../../project-access/filter-users-with-project-access";
import {
  assertAssignableUser,
  lockAssignableUser,
  NO_PROJECT_ACCESS,
  NOT_ASSIGNABLE,
} from "../../utils/assert-assignable-user";
import { coercePriority, VIRTUAL_STATUSES } from "../validate-task-fields";
import { resolveImportTaskStatus } from "../resolve-import-task-status";
import { claimTaskNumber } from "./claim-task-numbers";
import { nextTaskPosition } from "./next-task-position";
import type { InitiativeWriter } from "../../intelia/initiatives/access";
import { assignOnCreate } from "../../intelia/initiatives/service";
import {
  type AutomationChange,
  writeAutomation,
} from "../../intelia/task-automation/service";
import { resolveImportAssignees } from "../resolve-import-assignees";

export type ImportTask = {
  type?: "implementacion" | "validacion" | "operacion" | "diseno" | null;
  validationInProduction?: "requerida" | "no_aplica" | null;
  validationInProductionReason?: string | null;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  startDate?: string | null;
  dueDate?: string | null;
  userId?: string | null;
};

async function importTasks(
  projectId: string,
  tasksToImport: ImportTask[],
  currentUserId: string | undefined,
  automation: AutomationChange,
  // Intelia: the initiative of every imported task, signed by the importer.
  initiative?: { initiativeId: string; writer: InitiativeWriter },
) {
  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }

  const assigneeIds = [
    ...new Set(
      tasksToImport
        .map((task) => task.userId?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const assignees = await resolveImportAssignees(
    assigneeIds,
    project.workspaceId,
  );
  const assignableIds = await filterUsersWithProjectAccess(
    assignees.values(),
    projectId,
  );

  const columns = await db.query.columnTable.findMany({
    where: eq(columnTable.projectId, projectId),
    orderBy: asc(columnTable.position),
  });

  // Intelia (design 53 §3.2): archived tasks come in closed, with the mark.
  // Without a final column to put them in, nothing is imported.
  const archiveTarget = archiveColumn(columns);
  if (
    !archiveTarget &&
    tasksToImport.some((taskData) => {
      const resolved = resolveImportTaskStatus(taskData.status, columns);
      return !("error" in resolved) && resolved.status === ARCHIVED_STATUS;
    })
  )
    throw new ApiError(409, {
      code: "NO_FINAL_COLUMN",
      message:
        "The project has no final column to archive the imported archived tasks into; nothing was imported",
    });

  const results = [];
  let archivedAny = false;

  for (const taskData of tasksToImport) {
    const reference = taskData.userId?.trim() || null;
    const assigneeId = reference ? assignees.get(reference) : null;

    if (reference && (!assigneeId || !assignableIds.has(assigneeId))) {
      results.push({
        success: false,
        error: assigneeId ? NO_PROJECT_ACCESS : NOT_ASSIGNABLE,
        task: taskData,
      });
      continue;
    }

    try {
      const resolved = resolveImportTaskStatus(taskData.status, columns);
      if ("error" in resolved) {
        results.push({ success: false, error: resolved.error, task: taskData });
        continue;
      }
      const { warning: statusWarning } = resolved;
      // Intelia (design 53 §3.2): an archived task comes in closed, with the
      // mark. Its closed column is unknown, so it goes to `done`.
      const archived = resolved.status === ARCHIVED_STATUS;
      const resolvedStatus =
        archived && archiveTarget ? archiveTarget.slug : resolved.status;
      const { priority, warning: priorityWarning } = coercePriority(
        taskData.priority || "low",
      );
      const warnings = [statusWarning, priorityWarning].filter(Boolean);

      const createdTask = await db.transaction(async (tx) => {
        if (assigneeId) {
          await lockAssignableUser(tx, project.workspaceId, assigneeId);
          await assertAssignableUser(
            assigneeId,
            project.workspaceId,
            projectId,
            tx,
          );
        }
        const taskNumber = await claimTaskNumber(projectId, tx);
        // Recheck the snapshot's column and retain it until the insert commits.
        const [column] = await tx
          .select({ id: columnTable.id, isFinal: columnTable.isFinal })
          .from(columnTable)
          .where(
            and(
              eq(columnTable.projectId, projectId),
              eq(columnTable.slug, resolvedStatus),
            ),
          )
          .limit(1)
          .for("key share");
        // The final column went away meanwhile: no open task, no old status.
        if (archived && !column?.isFinal)
          throw new Error(
            `Column "${resolvedStatus}" is no longer final; the archived task was not imported`,
          );
        const status =
          column ||
          VIRTUAL_STATUSES.some((virtual) => virtual === resolvedStatus)
            ? resolvedStatus
            : "planned";
        if (status !== resolvedStatus) {
          warnings.push(
            `Status "${resolvedStatus}" no longer has a column. Mapped to "planned".`,
          );
        }
        const position = await nextTaskPosition(
          tx,
          projectId,
          status,
          column?.id ?? null,
        );

        const [task] = await tx
          .insert(taskTable)
          .values({
            projectId,
            userId: assigneeId ?? null,
            title: taskData.title,
            status,
            columnId: column?.id ?? null,
            startDate: taskData.startDate ? new Date(taskData.startDate) : null,
            dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
            description: taskData.description || "",
            priority,
            number: taskNumber,
            position,
          })
          .returning();

        if (task && taskData.type != null) {
          await tx.insert(taskClassificationTable).values({
            taskId: task.id,
            type: taskData.type,
            validationInProduction: taskData.validationInProduction ?? null,
            validationInProductionReason:
              taskData.validationInProductionReason ?? null,
          });
        }

        if (task && archived && column)
          await tx.insert(taskArchiveTable).values({
            taskId: task.id,
            archivedByUserId: currentUserId || null,
          });

        // Intelia: the level and the initiative commit with the task or the
        // task does not exist.
        if (task) await writeAutomation(tx, task.id, automation);
        if (task && initiative)
          await assignOnCreate(
            tx,
            task,
            initiative.initiativeId,
            initiative.writer,
          );

        return task;
      });

      if (createdTask) {
        if (archived) archivedAny = true;
        await publishEvent("task.created", {
          ...createdTask,
          taskId: createdTask.id,
          userId: createdTask.userId ?? "",
          currentUserId: currentUserId ?? "",
          type: "create",
          content: "imported the task",
        });

        results.push({
          success: true,
          task: createdTask,
          ...(warnings.length > 0 && { warnings }),
        });
      } else {
        results.push({
          success: false,
          error: "Failed to create task",
          task: taskData,
        });
      }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      results.push({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        task: taskData,
      });
    }
  }

  if (archivedAny) await announceArchived([projectId]);
  return {
    importedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
    },
    results: {
      total: tasksToImport.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      tasks: results,
    },
  };
}

export default importTasks;
