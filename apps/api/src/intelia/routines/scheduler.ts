import { and, asc, eq, lte } from "drizzle-orm";
import db from "../../database";
import { integrationTable, taskTable, userTable } from "../../database/schema";
import {
  type GenericWebhookConfig,
  normalizeGenericWebhookConfig,
} from "../../plugins/generic-webhook/config";
import { sendEvent } from "../../plugins/generic-webhook/events";
import updateTaskStatus from "../../task/controllers/update-task-status";
import { taskIsCompleted } from "../../task/task-is-completed";
import { type RoutineResult, routineRunTable, routineTable } from "../schema";
import { nextRunAt } from "./schedule";
import { ensureRoutineServiceAccount } from "./service-account";

export const REOPEN_STATUS = "in-progress";
export const ROUTINE_SKIPPED_EVENT = "intelia.routine_skipped";

type DueRoutine = {
  id: string;
  taskId: string;
  cron: string;
  timezone: string;
  nextRunAt: Date;
  ownerId: string;
  ownerName: string | null;
};

// Runs every minute (registered in apps/api/src/scheduler/index.ts). Each due
// routine runs once, however many ticks were missed, and is rescheduled from
// `now`.
export async function runDueRoutines(
  now = new Date(),
): Promise<{ degraded: boolean }> {
  const serviceUserId = await ensureRoutineServiceAccount();
  const due = await db
    .select({
      id: routineTable.id,
      taskId: routineTable.taskId,
      cron: routineTable.cron,
      timezone: routineTable.timezone,
      nextRunAt: routineTable.nextRunAt,
      ownerId: routineTable.ownerId,
      ownerName: userTable.name,
    })
    .from(routineTable)
    .leftJoin(userTable, eq(routineTable.ownerId, userTable.id))
    .where(and(eq(routineTable.active, true), lte(routineTable.nextRunAt, now)))
    .orderBy(asc(routineTable.nextRunAt));

  let degraded = false;
  for (const routine of due) {
    try {
      if ((await runRoutine(routine, serviceUserId, now)) === "error") {
        degraded = true;
      }
    } catch (error) {
      degraded = true;
      console.error(`Routine ${routine.id} failed`, error);
    }
  }
  return { degraded };
}

async function runRoutine(
  routine: DueRoutine,
  serviceUserId: string,
  now: Date,
): Promise<RoutineResult | null> {
  let next: Date | null = null;
  let scheduleFailure: string | null = null;
  try {
    next = nextRunAt(routine.cron, routine.timezone, now);
  } catch (error) {
    scheduleFailure = error instanceof Error ? error.message : String(error);
  }

  // Claim the tick: with several API instances only one moves next_run_at. A
  // schedule that cannot run again is paused instead.
  const [claimed] = await db
    .update(routineTable)
    .set({
      nextRunAt: next ?? routine.nextRunAt,
      active: next !== null,
      lastRunAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(routineTable.id, routine.id),
        eq(routineTable.active, true),
        eq(routineTable.nextRunAt, routine.nextRunAt),
      ),
    )
    .returning({ id: routineTable.id });
  if (!claimed) return null;

  const [task] = await db
    .select({ projectId: taskTable.projectId, completed: taskIsCompleted })
    .from(taskTable)
    .where(eq(taskTable.id, routine.taskId))
    .limit(1);
  if (!task) return null;

  let result: RoutineResult;
  let error = scheduleFailure;
  if (error) {
    result = "error";
  } else if (!task.completed) {
    result = "saltada_abierta";
  } else {
    try {
      await updateTaskStatus({
        id: routine.taskId,
        status: REOPEN_STATUS,
        currentUserId: serviceUserId,
      });
      result = "reabierta";
    } catch (reopenError) {
      result = "error";
      error =
        reopenError instanceof Error
          ? reopenError.message
          : String(reopenError);
    }
  }

  const [run] = await db
    .insert(routineRunTable)
    .values({
      routineId: routine.id,
      scheduledAt: routine.nextRunAt,
      result,
      error,
    })
    .returning({ id: routineRunTable.id });
  await db
    .update(routineTable)
    .set({ lastResult: result })
    .where(eq(routineTable.id, routine.id));

  if (result === "saltada_abierta" && run && next) {
    await notifyRoutineSkipped(
      routine,
      task.projectId,
      run.id,
      next,
      serviceUserId,
    );
  }
  return result;
}

// Same generic webhook, envelope and X-Kaneo-Signature as upstream's events,
// for every active generic webhook of the project that sends
// task.status_changed. Body documented in README-INTELIA.md.
async function notifyRoutineSkipped(
  routine: DueRoutine,
  projectId: string,
  runId: string,
  next: Date,
  serviceUserId: string,
) {
  const integrations = await db
    .select({ config: integrationTable.config })
    .from(integrationTable)
    .where(
      and(
        eq(integrationTable.projectId, projectId),
        eq(integrationTable.type, "generic-webhook"),
        eq(integrationTable.isActive, true),
      ),
    );
  for (const integration of integrations) {
    const config = normalizeGenericWebhookConfig(
      JSON.parse(integration.config) as GenericWebhookConfig,
    );
    if (!config.events?.taskStatusChanged) continue;
    await sendEvent(
      config,
      ROUTINE_SKIPPED_EVENT,
      routine.taskId,
      projectId,
      serviceUserId,
      {
        routineId: routine.id,
        runId,
        result: "saltada_abierta",
        scheduledAt: routine.nextRunAt.toISOString(),
        nextRunAt: next.toISOString(),
        cron: routine.cron,
        timezone: routine.timezone,
        owner: { id: routine.ownerId, name: routine.ownerName },
      },
    );
  }
}
