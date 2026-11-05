import { responseTimestamp, z } from "../../openapi";
import {
  INITIATIVE_CHANGE_KINDS,
  INITIATIVE_CHANGE_SOURCES,
  INITIATIVE_SOURCES,
  TASK_INITIATIVE_CHANGE_SOURCES,
  TASK_ORIGINS,
} from "../schema";

const origin = z.enum(TASK_ORIGINS).openapi({
  description:
    "plan: assigned while the initiative's plan was open. añadido: assigned after it closed. sin_registro: migrated from before initiatives existed. Set by the server, never by hand.",
});

const source = z.enum(INITIATIVE_SOURCES).openapi({
  description:
    "session: a person in Kaneo. api_key: an account's API key, with the `actor` its caller declared, if any. migration: a data migration.",
});

const timestamp = responseTimestamp.nullable();

export const initiativeSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    name: z.string(),
    objetivo: z.string().nullable(),
    hitos_externos: z
      .array(
        z.object({
          nombre: z.string(),
          enlace: z.string(),
          estado: z.enum(["pendiente", "hecho", "bloqueado"]),
          tarea: z.string().optional(),
        }),
      )
      .nullable(),
    designUrl: z.string().nullable(),
    approvedBy: z.string().nullable(),
    approvedAt: timestamp,
    createdByUserId: z.string().nullable(),
    createdByName: z.string().nullable(),
    createdByActor: z.string().nullable(),
    source,
    createdAt: responseTimestamp,
    planClosedAt: timestamp.openapi({
      description:
        "When the plan closed: by hand, or when a task of the initiative first reached In progress. Null while planning.",
    }),
  })
  .openapi("Initiative");

export const initiativeChangeSchema = z
  .object({
    id: z.string(),
    initiativeId: z.string(),
    kind: z.enum(INITIATIVE_CHANGE_KINDS),
    previous: z.record(z.string(), z.unknown()).nullable(),
    value: z.record(z.string(), z.unknown()),
    taskId: z.string().nullable().openapi({
      description: "The task whose start closed the plan (`auto`).",
    }),
    source: z.enum(INITIATIVE_CHANGE_SOURCES).openapi({
      description:
        "As in Initiative, plus auto: the plan closed when a task reached In progress.",
    }),
    changedByUserId: z.string().nullable(),
    changedByName: z.string().nullable(),
    changedByActor: z.string().nullable(),
    changedAt: responseTimestamp,
  })
  .openapi("InitiativeChange");

export const initiativeChangeListSchema = z.array(initiativeChangeSchema);

export const deletedInitiativeSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    name: z.string(),
    unlinkedTaskIds: z.array(z.string()).openapi({
      description:
        "The cancelled tasks it had, now without initiative (each with a row in its initiative log). Empty when it had none.",
    }),
  })
  .openapi("DeletedInitiative");

export const taskInitiativeSchema = z
  .object({
    taskId: z.string(),
    initiativeId: z.string(),
    initiativeName: z.string(),
    origin,
    since: responseTimestamp,
    setByUserId: z.string().nullable(),
    setByName: z.string().nullable(),
    setByActor: z.string().nullable(),
    source,
  })
  .openapi("TaskInitiative");

export const taskInitiativeChangeSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    previousInitiativeId: z.string().nullable(),
    previousOrigin: origin.nullable(),
    initiativeId: z.string().nullable().openapi({
      description:
        "Null when the task lost its initiative by leaving the project.",
    }),
    origin: origin.nullable(),
    source: z.enum(TASK_INITIATIVE_CHANGE_SOURCES).openapi({
      description:
        "As in TaskInitiative, plus project_move: the task moved to another project and lost its initiative.",
    }),
    changedByUserId: z.string().nullable(),
    changedByName: z.string().nullable(),
    changedByActor: z.string().nullable(),
    changedAt: responseTimestamp,
  })
  .openapi("TaskInitiativeChange");

export const taskInitiativeChangeListSchema = z.array(
  taskInitiativeChangeSchema,
);

// Reads of design 19 §6: the listing with its counters and the detail.

const tally = z.object({
  total: z.number().int(),
  active: z.number().int().openapi({ description: "Not Cancelled." }),
  done: z.number().int(),
});

const counters = z
  .object({
    total: z.number().int(),
    active: z.number().int().openapi({
      description: "Every task but the Cancelled ones: the progress base.",
    }),
    done: z.number().int().openapi({ description: "Only Done counts." }),
    cancelled: z.number().int(),
    blocked: z.number().int(),
    plan: tally,
    added: tally.openapi({ description: "Origin `añadido`." }),
    unrecorded: tally.openapi({
      description:
        "Origin `sin_registro` (migrated). They count in the progress but not in plan or added; with any, the initiative shows no growth.",
    }),
  })
  .openapi("InitiativeCounters", {
    description:
      "Tasks of the initiative the caller can read. Cancelled tasks keep their origin and count in `total` and `cancelled`, never in `active` or `done`.",
  });

const state = z
  .enum(["in_flight", "finished", "no_tasks", "all_cancelled"])
  .openapi({
    description:
      "Derived, never stored. in_flight: some active task not Done. finished: active tasks, all Done. no_tasks: none. all_cancelled: tasks, all Cancelled.",
  });

const assignee = z
  .object({ id: z.string(), name: z.string().nullable() })
  .nullable();

const blockReason = {
  blockReason: z.string().nullable().openapi({
    description:
      "The `motivo_bloqueo` custom field of a Blocked task; null otherwise or when empty.",
  }),
  blockReasonDetail: z.string().nullable().openapi({
    description:
      "The `motivo_bloqueo_detalle` custom field of a Blocked task; null otherwise, when empty or when the project lacks the field.",
  }),
};

const statusSince = responseTimestamp.openapi({
  description:
    "Last status change in the task's activity log, or its creation if it never changed: «sin cambios de estado desde».",
});

const blockedTaskSchema = z
  .object({
    id: z.string(),
    number: z.number().int().nullable(),
    title: z.string(),
    assignee,
    statusSince,
    ...blockReason,
  })
  .openapi("InitiativeBlockedTask");

export const initiativeSummarySchema = initiativeSchema
  .extend({ state, counters, blockedTasks: z.array(blockedTaskSchema) })
  .openapi("InitiativeSummary");

const unassignedTaskSchema = z
  .object({
    id: z.string(),
    number: z.number().int().nullable(),
    title: z.string(),
    status: z.string(),
    assignee,
  })
  .openapi("TaskWithoutInitiative");

export const projectInitiativesSchema = z
  .object({
    initiatives: z.array(initiativeSummarySchema),
    withoutInitiative: z.array(unassignedTaskSchema).openapi({
      description: "Tasks of the project that belong to no initiative.",
    }),
  })
  .openapi("ProjectInitiatives");

const initiativeTaskSchema = z
  .object({
    id: z.string(),
    number: z.number().int().nullable(),
    title: z.string(),
    status: z.string(),
    origin,
    since: responseTimestamp.openapi({
      description: "When the task joined the initiative.",
    }),
    assignee,
    statusSince,
    ...blockReason,
    dependsOn: z.array(z.string()).openapi({
      description:
        "Ids of the tasks that block this one (`blocks` relations), only the ones the caller can read: in `tasks` or `externalTasks`.",
    }),
    blocks: z.array(z.string()).openapi({
      description: "Ids of the tasks this one blocks, under the same rule.",
    }),
  })
  .openapi("InitiativeTask");

const externalTaskSchema = z
  .object({
    id: z.string(),
    number: z.number().int().nullable(),
    title: z.string(),
    status: z.string(),
    projectId: z.string(),
    projectSlug: z.string(),
    projectName: z.string(),
    initiativeId: z.string().nullable(),
  })
  .openapi("InitiativeExternalTask", {
    description:
      "A readable task outside the initiative that one of its tasks depends on or blocks.",
  });

export const initiativeDetailSchema = initiativeSchema
  .extend({
    state,
    counters,
    tasks: z.array(initiativeTaskSchema),
    externalTasks: z.array(externalTaskSchema),
    pendingChain: z
      .object({
        taskIds: z.array(z.string()).openapi({
          description:
            "The longest chain of pending (neither Done nor Cancelled) tasks linked by `blocks`, first blocker first. Empty with a cycle.",
        }),
        partial: z.boolean().openapi({
          description:
            "A pending task of the initiative has a dependency the caller cannot read, left out without any of its data.",
        }),
        cycle: z.boolean().openapi({
          description: "The pending dependencies form a cycle: no chain.",
        }),
      })
      .openapi("InitiativePendingChain"),
  })
  .openapi("InitiativeDetail");

export const taskInitiativesSchema = z
  .object({
    tasks: z.array(
      z
        .object({
          taskId: z.string(),
          initiativeId: z.string().nullable(),
          initiativeName: z.string().nullable(),
        })
        .openapi("TaskInitiativeRef", {
          description:
            "A readable task and its initiative; both null when it has none.",
        }),
    ),
  })
  .openapi("TaskInitiatives", {
    description:
      "One entry per requested task of the workspace the caller can read, by task id. Unknown tasks, tasks of other workspaces and tasks of projects the caller cannot read are left out, indistinguishably.",
  });
