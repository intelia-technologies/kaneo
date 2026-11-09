import {
  nullableResponseTimestamp,
  responseTimestamp,
  z,
} from "../../../openapi";
import { AUTOMATION_LEVELS } from "../../schema";
import { assignee, blockReason } from "../response";
import { DEFAULT_HOURS, ESTIMATE_SOURCES, MIN_CASES } from "./estimate";
import { PLAN_MARKS, STALL_REASONS } from "./mark";

const hours = (description: string) =>
  z.number().nonnegative().openapi({ description });

const estimateSchema = z
  .object({
    hours: hours("Estimated hours of the whole task, to one decimal."),
    source: z.enum(ESTIMATE_SOURCES).openapi({
      description: `manual: the task's \`estimacion_horas\` (set through \`PUT /api/task/estimacion_horas/{id}\` or the task's create and update). project: median of the finished tasks of the last 90 days of its project with the same automation level (${AUTOMATION_LEVELS.join(", ")} or none) and executor (ephemeral agent, persistent agent or person; any, when unassigned), from ${MIN_CASES} of them. org: the same median over every project of the workspace the caller can read, when its project has fewer. default: ${DEFAULT_HOURS} h, with fewer still.`,
    }),
    cases: z.number().int().nonnegative().openapi({
      description:
        "Finished tasks behind the median; 0 for manual and default.",
    }),
  })
  .openapi("InitiativePlanEstimate");

const planTaskSchema = z
  .object({
    id: z.string(),
    number: z.number().int().nullable(),
    title: z.string(),
    status: z.string(),
    statusSince: responseTimestamp.openapi({
      description: "When this task last entered its current column.",
    }),
    external: z.boolean().openapi({
      description:
        "A readable task of another initiative or project that a task of this one depends on or blocks.",
    }),
    projectId: z.string(),
    assignee,
    plain: z.string().nullable().openapi({
      description:
        "The «**En llano.**» paragraph opening the description, without its marker; null when it lacks one and for external tasks.",
    }),
    actualStart: nullableResponseTimestamp.openapi({
      description: "First move to In progress or In review.",
    }),
    actualEnd: nullableResponseTimestamp.openapi({
      description: "Last move to Done, for a Done task.",
    }),
    workedHours: hours(
      "Time in In progress and In review so far, Blocked and the rest left out.",
    ),
    estimate: estimateSchema,
    remainingHours: hours(
      "Hours left: 0 once Done or Cancelled; once started, the estimate minus the worked hours and at least 1; otherwise the estimate.",
    ),
    plannedStart: nullableResponseTimestamp.openapi({
      description:
        "The real start once started; for a pending task not started, when its pending blockers end (or now). Null with a cycle.",
    }),
    plannedEnd: nullableResponseTimestamp.openapi({
      description:
        "The real end for a Done task; for a pending one, its planned start plus its remaining hours, chained after its blockers. Null with a cycle or for a Cancelled task.",
    }),
    critical: z.boolean(),
    mark: z.enum(PLAN_MARKS).nullable().openapi({
      description:
        "How a pending task stands (annex of design 19 §3.2). blocked: in Blocked, with its reason. waiting: readable blockers still pending ahead. advancing: in In progress or In review, last status change within the column's p90 (design 23), and someone on it: for an agent, a worker the dispatcher reports `activo` and `trabajando` in board signals of at most 10 minutes (RT-05); for a person, being assigned. stalled: To do with no pending blockers and assigned to a role, or In progress with nobody working. A partial plan cannot confirm which To do tasks are ready, so they are not marked stalled. Null for other pending tasks and once Done or Cancelled.",
    }),
    stallReason: z.enum(STALL_REASONS).nullable().openapi({
      description:
        "Provisional reason of a stalled task: unassigned; no_worker; worker_down, worker_finished or worker_idle; not_started (To do assigned to a role). The MF-01 watcher's real reason is outside GT-06. Null unless stalled.",
    }),
    ...blockReason,
    dependsOn: z.array(z.string()).openapi({
      description: "Ids of the readable tasks that block this one.",
    }),
  })
  .openapi("InitiativePlanTask");

export const initiativePlanSchema = z
  .object({
    initiativeId: z.string(),
    projectId: z.string(),
    projectScope: z.array(z.string()).nullable().openapi({
      description:
        "Effective readable project intersection, or null when no projectIds filter was supplied.",
    }),
    name: z.string(),
    computedAt: responseTimestamp,
    estimatesComputedAt: responseTimestamp.openapi({
      description:
        "When the finished tasks behind the medians were read; kept 10 minutes.",
    }),
    estimatedEnd: nullableResponseTimestamp.openapi({
      description:
        "The end of the critical path: an estimate, without sharing capacity between machines. Null with nothing pending or with a cycle.",
    }),
    criticalPath: z
      .object({
        taskIds: z.array(z.string()).openapi({
          description:
            "The chain of pending tasks with the most remaining hours that ends at the goal, or at the initiative's task that ends last; first blocker first.",
        }),
        hours: hours("Remaining hours along the chain."),
        goalTaskId: z.string().nullable().openapi({
          description:
            "The initiative's goal task (`objetivo`), if it has one the caller can read; the chain ends there while it is pending, and at the task that ends last otherwise.",
        }),
        partial: z.boolean().openapi({
          description:
            "A dependency endpoint is unreadable, or the initiative has a pending task of a project the caller cannot read (design 52); left out without any of their data.",
        }),
        cycle: z.boolean().openapi({
          description:
            "The pending dependencies form a cycle: no chain and no planned dates.",
        }),
        summary: z
          .object({
            advancing: z.number().int(),
            blocked: z.number().int(),
            stalled: z.number().int(),
            waiting: z.number().int(),
          })
          .openapi({ description: "Tasks of the chain by mark." }),
      })
      .openapi("InitiativeCriticalPath"),
    tasks: z.array(planTaskSchema).openapi({
      description:
        "The initiative's readable tasks by number, then the external ones.",
    }),
  })
  .openapi("InitiativePlan");
