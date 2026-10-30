import { pagingNumber, z } from "../../openapi";
import { DEFAULT_TIMEZONE } from "./schedule";

export const taskIdParam = z.object({ taskId: z.string() });

export const workspaceIdParam = z.object({ workspaceId: z.string() });

export const routineRunsQuery = z.object({
  limit: pagingNumber(1, 200, 50).openapi({
    description: "Maximum number of runs, newest first.",
  }),
});

export const routineInput = z.object({
  cron: z.string().trim().min(1).max(120).openapi({
    description:
      "Five-field cron expression (minute hour day-of-month month day-of-week).",
    example: "0 */2 * * *",
  }),
  timezone: z.string().trim().min(1).max(64).default(DEFAULT_TIMEZONE).openapi({
    description: "IANA time zone the cron expression is read in.",
    example: DEFAULT_TIMEZONE,
  }),
  active: z.boolean().default(true).openapi({
    description: "false pauses the routine without removing it.",
  }),
});
