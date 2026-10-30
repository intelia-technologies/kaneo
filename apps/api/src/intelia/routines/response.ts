import { nullableResponseTimestamp, responseTimestamp, z } from "../../openapi";
import { ROUTINE_RESULTS } from "../schema";

const routineResult = z.enum(ROUTINE_RESULTS).openapi({
  description:
    "reabierta: the task was reopened to In progress. saltada_abierta: the task was still open, so the tick was skipped. error: the reopen failed.",
});

export const routineSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    cron: z.string().openapi({ example: "0 */2 * * *" }),
    timezone: z.string().openapi({ example: "Europe/Madrid" }),
    active: z.boolean(),
    ownerId: z.string().openapi({
      description: "The user who last scheduled or changed the routine.",
    }),
    ownerName: z.string().nullable(),
    nextRunAt: responseTimestamp,
    lastRunAt: nullableResponseTimestamp,
    lastResult: routineResult.nullable(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("Routine");

export const workspaceRoutineSchema = routineSchema
  .extend({
    task: z.object({
      id: z.string(),
      number: z.number().nullable(),
      title: z.string(),
      status: z.string(),
      projectId: z.string(),
      projectName: z.string(),
      projectSlug: z.string(),
      assigneeId: z.string().nullable(),
      assigneeName: z.string().nullable(),
    }),
  })
  .openapi("WorkspaceRoutine");

export const workspaceRoutineListSchema = z.array(workspaceRoutineSchema);

export const routineRunSchema = z
  .object({
    id: z.string(),
    routineId: z.string(),
    scheduledAt: responseTimestamp,
    result: routineResult,
    error: z.string().nullable(),
    closedAt: nullableResponseTimestamp.openapi({
      description:
        "When the task reached Done or Cancelled (a final column) after this run.",
    }),
    createdAt: responseTimestamp,
  })
  .openapi("RoutineRun");

export const routineRunListSchema = z.array(routineRunSchema);
