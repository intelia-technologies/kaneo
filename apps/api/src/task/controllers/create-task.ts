import { extractAssetIds } from "../../storage/cleanup-assets";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  assetTable,
  columnTable,
  customFieldDefinitionTable,
  customFieldValueTable,
  taskTable,
  projectTable,
  userTable,
} from "../../database/schema";
import {
  findNewHiddenPicks,
  isChoiceType,
  readHiddenOptions,
  readOptions,
} from "../../custom-field/choice-options";
import { publishEvent } from "../../events";
import type { InitiativeWriter } from "../../intelia/initiatives/access";
import type { InitiativeOnCreate } from "../../intelia/initiatives/schema";
import {
  assignOnCreate,
  resolveInitiativeOnCreate,
} from "../../intelia/initiatives/service";
import {
  type AutomationChange,
  writeAutomation,
} from "../../intelia/task-automation/service";
import {
  assertAssignableUser,
  getProjectWorkspaceId,
  lockAssignableUser,
} from "../../utils/assert-assignable-user";
import type { TaskRecurrence } from "../recurrence/schema";
import {
  assertRequiredCustomFields,
  assertValidTaskStatus,
  isCustomFieldValueEmpty,
} from "../validate-task-fields";
import { claimTaskNumber } from "./claim-task-numbers";
import { nextTaskPosition } from "./next-task-position";

type CustomFieldInput = {
  fieldId: string;
  value: string;
};

function deduplicateCustomFields(
  customFields?: CustomFieldInput[],
): CustomFieldInput[] | undefined {
  if (!customFields) {
    return undefined;
  }

  const fieldsById = new Map<string, CustomFieldInput>();

  for (const customField of customFields) {
    fieldsById.set(customField.fieldId, customField);
  }

  return Array.from(fieldsById.values());
}

async function createTask({
  projectId,
  currentUserId,
  userId,
  title,
  status,
  startDate,
  dueDate,
  estimacion_horas,
  description,
  priority,
  recurrence,
  customFields,
  draftAssetIds,
  automation,
  initiative,
}: {
  projectId: string;
  currentUserId: string;
  userId?: string;
  title: string;
  status: string;
  startDate?: Date;
  dueDate?: Date;
  estimacion_horas?: number | null;
  description?: string;
  priority?: string;
  recurrence?: TaskRecurrence;
  customFields?: CustomFieldInput[];
  draftAssetIds?: string[];
  // Intelia: the task's level, committed with the task (before task.created).
  automation?: AutomationChange;
  // Intelia: the task's initiative, committed with the task.
  initiative?: { input: InitiativeOnCreate; writer: InitiativeWriter };
}) {
  const resolvedStatus = status || "to-do";
  const resolvedPriority = priority || "no-priority";
  const normalizedCustomFields = deduplicateCustomFields(customFields);

  const normalizedUserId = userId?.trim() || undefined;

  await assertValidTaskStatus(resolvedStatus, projectId);

  const allFields = await db
    .select()
    .from(customFieldDefinitionTable)
    .where(eq(customFieldDefinitionTable.projectId, projectId));

  for (const input of normalizedCustomFields ?? []) {
    const field = allFields.find((candidate) => candidate.id === input.fieldId);
    if (!field || !isChoiceType(field.type)) continue;
    const hidden = readHiddenOptions(
      field.hiddenOptions,
      readOptions(field.options),
    );
    if (findNewHiddenPicks(input.value, null, field.type, hidden).length > 0) {
      throw new HTTPException(400, {
        message: `Custom field "${field.name}" has a hidden option selected.`,
      });
    }
  }

  const mergedCustomFields: CustomFieldInput[] = normalizedCustomFields ?? [];
  const providedFieldIds = new Set(mergedCustomFields.map((f) => f.fieldId));

  for (const field of allFields) {
    if (
      !providedFieldIds.has(field.id) &&
      field.required &&
      field.defaultValue != null &&
      !isCustomFieldValueEmpty(
        field.defaultValue,
        field.type as
          | "number"
          | "boolean"
          | "date"
          | "dropdown"
          | "multiselect",
      )
    ) {
      mergedCustomFields.push({
        fieldId: field.id,
        value: field.defaultValue,
      });
    }
  }

  await assertRequiredCustomFields(projectId, mergedCustomFields);

  let assignee: { name: string } | undefined;

  if (normalizedUserId) {
    [assignee] = await db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, normalizedUserId));
  }

  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.projectId, projectId),
      eq(columnTable.slug, resolvedStatus),
    ),
  });
  // A rule would never fire on a task that starts out completed.
  if (recurrence && column?.isFinal)
    throw new HTTPException(400, {
      message: "Create the task in an open column to make it repeat",
    });

  const initiativeId = initiative
    ? await resolveInitiativeOnCreate(projectId, initiative.input)
    : null;

  const createdTask = await db.transaction(async (tx) => {
    if (normalizedUserId) {
      const workspaceId = await getProjectWorkspaceId(projectId, tx);
      await lockAssignableUser(tx, workspaceId, normalizedUserId);
      await assertAssignableUser(normalizedUserId, workspaceId, projectId, tx);
    }
    const taskNumber = await claimTaskNumber(projectId, tx);
    const nextPosition = await nextTaskPosition(
      tx,
      projectId,
      resolvedStatus,
      column?.id ?? null,
    );

    const [task] = await tx
      .insert(taskTable)
      .values({
        projectId,
        userId: normalizedUserId ?? null,
        title: title || "",
        status: resolvedStatus,
        columnId: column?.id ?? null,
        startDate: startDate || null,
        dueDate: dueDate || null,
        estimacion_horas: estimacion_horas ?? null,
        description: description || "",
        priority: resolvedPriority,
        recurrence: recurrence ?? null,
        number: taskNumber,
        position: nextPosition,
      })
      .returning();

    if (task && draftAssetIds?.length) {
      const referenced = extractAssetIds(description);
      const ids = [...new Set(draftAssetIds)].filter((id) =>
        referenced.has(id),
      );
      if (ids.length) {
        // claimTaskNumber already holds the project row lock in this transaction.
        const project = await tx.query.projectTable.findFirst({
          columns: { workspaceId: true },
          where: eq(projectTable.id, projectId),
        });
        if (!project)
          throw new HTTPException(404, { message: "Project not found" });
        const claimed = await tx
          .update(assetTable)
          .set({
            taskId: task.id,
            surface: "description",
            workspaceId: project.workspaceId,
          })
          .where(
            and(
              inArray(assetTable.id, ids),
              eq(assetTable.projectId, projectId),
              eq(assetTable.createdBy, currentUserId),
              eq(assetTable.surface, "draft"),
              isNull(assetTable.taskId),
            ),
          )
          .returning({ id: assetTable.id });
        if (claimed.length !== ids.length)
          throw new HTTPException(400, {
            message:
              "Some staged uploads are unavailable or belong to another owner/project",
          });
      }
    }

    if (task && mergedCustomFields.length) {
      await tx.insert(customFieldValueTable).values(
        mergedCustomFields.map(({ fieldId, value }) => ({
          taskId: task.id,
          fieldId,
          value: value.trim(),
        })),
      );
    }

    if (task && automation) await writeAutomation(tx, task.id, automation);
    if (task && initiative && initiativeId)
      await assignOnCreate(tx, task, initiativeId, initiative.writer);

    return task;
  });

  if (!createdTask) {
    throw new HTTPException(500, {
      message: "Failed to create task",
    });
  }

  await publishEvent("task.created", {
    ...createdTask,
    taskId: createdTask.id,
    userId: createdTask.userId ?? "",
    currentUserId: currentUserId,
    type: "created",
    content: null,
  });

  return {
    ...createdTask,
    assigneeName: assignee?.name,
  };
}

export default createTask;
