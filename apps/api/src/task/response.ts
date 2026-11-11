import { estadoCompartidoSchema } from "../intelia/estado-compartido/schema";
import { nullableResponseTimestamp, responseTimestamp, z } from "../openapi";
import { blockersSummarySchema } from "./blockers-summary/schema";
import { taskRecurrenceSchema } from "./recurrence/schema";

const priorityDescription = "One of: no-priority, low, medium, high, urgent.";

export const taskSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    position: z.number().nullable().openapi({
      description: "Order within its column, ascending.",
    }),
    number: z.number().nullable().openapi({
      description: "Per-project counter shown as {projectSlug}-{number}.",
    }),
    userId: z
      .string()
      .nullable()
      .openapi({ description: "The assignee, if any." }),
    title: z.string(),
    description: z.string().nullable(),
    descriptionDeferred: z.boolean().optional().openapi({
      description:
        "True when the list omits a large description; load the task detail or description pages to read it. Do not replace stored text with this null summary.",
    }),
    status: z.string().openapi({
      description: "The slug of the column the task sits in.",
    }),
    priority: z.string().openapi({ description: priorityDescription }),
    startDate: nullableResponseTimestamp,
    dueDate: nullableResponseTimestamp,
    estimacion_horas: z
      .number()
      .nullable()
      .openapi({ description: "Estimated hours, or null when unset." }),
    estado_compartido: estadoCompartidoSchema.nullable().optional().openapi({
      description:
        "The chain's shared state when this is the root task of a chain without an initiative (annex of design 33 §4.1), or null. Returned by the task's detail, create and update, not by board lists.",
    }),
    recurrence: z.union([taskRecurrenceSchema, z.null()]).optional(),
    createdAt: responseTimestamp,
    customFields: z
      .array(z.object({ fieldId: z.string(), value: z.string() }))
      .optional(),
  })
  .openapi("Task");

export const taskWithAssigneeSchema = taskSchema
  .extend({
    type: z
      .enum(["implementacion", "validacion", "operacion", "diseno"])
      .nullable(),
    validationInProduction: z.enum(["requerida", "no_aplica"]).nullable(),
    validationInProductionReason: z.string().nullable(),
    archivedAt: nullableResponseTimestamp.openapi({
      type: ["string", "null"],
      format: "date-time",
      description:
        "When the task was archived (Intelia fork, design 53 §3.2), or null. Archiving does not change the status.",
    }),
    workspaceId: z.string().optional().openapi({
      description:
        "The workspace currently owning the task's project. Included in the detail view; omitted from the compact board view.",
    }),
    columnId: z.string().nullable().openapi({
      description:
        "The referenced workflow column; null for virtual statuses and legacy tasks without a column reference.",
    }),
    subtaskCounts: z
      .object({ completed: z.number(), total: z.number() })
      .optional(),
    parentSubtaskCounts: z
      .array(
        z.object({
          taskId: z.string(),
          completed: z.number(),
          total: z.number(),
        }),
      )
      .optional(),
    blockersSummary: blockersSummarySchema.optional().openapi({
      description:
        "Why the task waits (design 55 §3.1). Included by GET /task/{id}; omitted elsewhere.",
    }),
    assigneeName: z.string().nullable(),
    assigneeId: z.string().nullable(),
  })
  .openapi("TaskWithAssignee");

export const taskByTicketIdSchema = taskWithAssigneeSchema
  .extend({
    workspaceId: z.string().openapi({
      description: "The workspace that owns the task's project.",
    }),
  })
  .openapi("TaskByTicketId");

const taskLabelSchema = z
  .object({ id: z.string(), name: z.string(), color: z.string() })
  .openapi("TaskLabel");

const taskExternalLinkSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    integrationId: z.string().nullable(),
    resourceType: z.string(),
    externalId: z.string(),
    url: z.string(),
    title: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable().openapi({
      description:
        "Provider-specific payload, already parsed from the stored JSON string.",
    }),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("TaskExternalLink");

export const boardTaskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    number: z.number().nullable(),
    description: z.string().nullable(),
    descriptionDeferred: z.boolean().optional().openapi({
      description:
        "True when the list omits a large description; load the task detail or description pages to read it. Do not replace stored text with this null summary.",
    }),
    status: z.string(),
    archivedAt: nullableResponseTimestamp.openapi({
      type: ["string", "null"],
      format: "date-time",
      description:
        "When the task was archived (Intelia fork, design 53 §3.2), or null. Archiving does not change the status.",
    }),
    type: z
      .enum(["implementacion", "validacion", "operacion", "diseno"])
      .nullable(),
    blockersSummary: blockersSummarySchema,
    priority: z.string().openapi({ description: priorityDescription }),
    startDate: nullableResponseTimestamp,
    dueDate: nullableResponseTimestamp,
    estimacion_horas: z.number().nullable(),
    recurrence: z.union([taskRecurrenceSchema, z.null()]),
    position: z.number().nullable(),
    createdAt: responseTimestamp,
    statusSince: responseTimestamp.openapi({
      description:
        "When the task entered its current column (Intelia fork, design 23 §3): its last status change in the activity log, or its creation if it never changed. Reordering within a column does not count.",
    }),
    userId: z.string().nullable(),
    assigneeName: z.string().nullable(),
    assigneeId: z.string().nullable(),
    assigneeImage: z.string().nullable(),
    projectId: z.string(),
    subtaskCounts: z
      .object({
        completed: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
      })
      .openapi({
        description:
          "Direct subtasks in the workspace; completed means a final column in the child project. Public boards count only children in public projects.",
      }),
    labels: z.array(taskLabelSchema),
    externalLinks: z.array(taskExternalLinkSchema),
  })
  .openapi("BoardTask");

export const boardColumnSchema = z
  .object({
    id: z.string().openapi({ description: "The column slug, same as `slug`." }),
    slug: z.string(),
    name: z.string(),
    icon: z.string().nullable(),
    isFinal: z.boolean(),
    position: z.number().optional(),
    tasks: z.array(boardTaskSchema),
  })
  .openapi("BoardColumn");

export const boardSchema = z
  .object({
    data: z
      .object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        icon: z.string().nullable(),
        description: z.string().nullable(),
        descriptionDeferred: z.boolean().optional().openapi({
          description:
            "True when a project description above 64 KiB is omitted; use project detail or public project description pages for full text.",
        }),
        isPublic: z.boolean().nullable(),
        workspaceId: z.string(),
        backgroundVersion: z.string().nullable(),
        columns: z.array(boardColumnSchema),
        archivedTasks: z.array(boardTaskSchema),
        plannedTasks: z.array(boardTaskSchema),
      })
      .openapi("Board"),
    pagination: z
      .object({
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
        totalPages: z.number(),
        relatedPage: z.number(),
        relatedPageSize: z.number(),
        relatedTotalPages: z.number(),
        relatedRevision: z.string().optional().openapi({
          description:
            "Public board labels and external links revision for this task page. Restart pagination if it changes during related-page continuations.",
        }),
        revision: z.string().optional().openapi({
          description:
            "Public board content, membership and ordering revision, including related records and visible subtask progress. Restart pagination if it changes between task or related pages.",
        }),
      })
      .openapi({
        description:
          "Always paginated: 50 tasks by default, at most 100 per page. Continue through totalPages to retrieve all tasks. For each task page, follow relatedPage through relatedTotalPages to retrieve all labels, external links and columns (100 related rows per kind per request, plus up to 100 columns needed to represent the tasks).",
      })
      .openapi("BoardPagination"),
  })
  .openapi("BoardResponse");

export const bulkResultSchema = z
  .object({ success: z.boolean(), updatedCount: z.number() })
  .openapi("BulkTaskResult");

export const moveTaskResultSchema = z
  .object({
    task: taskSchema,
    sourceProjectId: z.string(),
    destinationProjectId: z.string(),
  })
  .openapi("MoveTaskResult");

export const taskExportSchema = z
  .object({
    project: z
      .object({
        name: z.string(),
        slug: z.string(),
        description: z.string().nullable(),
        exportedAt: z.string().openapi({ format: "date-time" }),
      })
      .openapi("TaskExportProject"),
    tasks: z.array(
      z
        .object({
          title: z.string(),
          description: z.string(),
          status: z.string(),
          priority: z.string(),
          dueDate: z.string().nullable().openapi({ format: "date-time" }),
          startDate: z.string().nullable().openapi({ format: "date-time" }),
          userId: z.string().nullable(),
          labels: z
            .array(
              z
                .object({ name: z.string(), color: z.string() })
                .openapi("ExportedTaskLabel"),
            )
            .openapi({
              description: "Label names and colors, without their ids.",
            }),
        })
        .openapi("ExportedTask"),
    ),
  })
  .openapi("TaskExport");

export const taskImportResultSchema = z
  .object({
    results: z
      .object({
        total: z.number(),
        successful: z.number(),
        failed: z.number(),
        tasks: z.array(z.unknown()).openapi({
          description: "Per-task outcome, each carrying a success flag.",
        }),
      })
      .openapi("TaskImportSummary"),
  })
  .openapi("TaskImportResult");

export const imageUploadSchema = z
  .object({
    key: z.string().openapi({
      description: "Object key to send back to the finalize route.",
    }),
    uploadUrl: z.string().openapi({
      description: "Presigned URL to PUT the image bytes to.",
    }),
    headers: z.record(z.string(), z.string()).openapi({
      description:
        "Headers that must accompany the upload request, including Content-Type.",
    }),
  })
  .openapi("TaskImageUpload");

export const finalizedAssetSchema = z
  .object({
    id: z.string(),
    url: z.string().openapi({
      description: "Where the stored image can be read back from.",
    }),
  })
  .openapi("TaskImageAsset");

export const descriptionPageSchema = z
  .object({
    content: z.string(),
    version: z.string(),
    nextOffset: z.number().nullable(),
  })
  .openapi("TaskDescriptionPage");
export const descriptionMatchesSchema = z
  .object({ ids: z.array(z.string()), nextCursor: z.string().nullable() })
  .openapi("TaskDescriptionMatches");

export const assignedTasksSchema = z
  .object({
    tasks: z.array(
      z
        .object({
          id: z.string(),
          projectId: z.string(),
          number: z.number().nullable(),
          title: z.string(),
          status: z.string().openapi({
            description: "The slug of the column the task sits in.",
          }),
          statusName: z.string().nullable().openapi({
            description:
              "The column's display name. Null for tasks outside a column, such as planned ones.",
          }),
          statusIcon: z.string().nullable(),
          priority: z.string().openapi({ description: priorityDescription }),
          dueDate: nullableResponseTimestamp,
          projectName: z.string(),
          projectSlug: z.string(),
          projectIcon: z.string().nullable(),
          labels: z.array(taskLabelSchema),
        })
        .openapi("AssignedTask"),
    ),
    total: z.number().openapi({
      description:
        "All open tasks assigned to the caller, including any beyond the first 100 returned.",
    }),
  })
  .openapi("AssignedTasks");
