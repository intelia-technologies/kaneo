import { Cron } from "croner";

export const DEFAULT_TIMEZONE = "Europe/Madrid";

// First run strictly after `from`. Missed ticks are never replayed: the
// scheduler always counts from "now".
export function nextRunAt(cron: string, timezone: string, from: Date): Date {
  const next = new Cron(cron, { timezone, paused: true }).nextRun(from);
  if (!next) throw new Error(`The cron expression "${cron}" never runs again`);
  return next;
}

// Five fields (minute hour day-of-month month day-of-week): the scheduler
// ticks once a minute, so a seconds field could never be honoured.
export function scheduleError(cron: string, timezone: string): string | null {
  if (cron.trim().split(/\s+/).length !== 5) {
    return "cron must have five fields: minute hour day-of-month month day-of-week";
  }
  try {
    nextRunAt(cron, timezone, new Date());
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
