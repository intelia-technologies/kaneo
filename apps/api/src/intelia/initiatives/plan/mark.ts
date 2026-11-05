// Annex of design 19 §3.2: how each pending task stands. Blocked first, then
// waiting on open blockers; in progress or in review with someone on it and
// a status change within the column's p90 (design 23) is advancing; anything
// else that could move and does not is stalled.
export const PLAN_MARKS = [
  "advancing",
  "blocked",
  "stalled",
  "waiting",
] as const;
export type PlanMark = (typeof PLAN_MARKS)[number];

const WORKING = new Set(["in-progress", "in-review"]);

export function planMark(task: {
  status: string;
  assigned: boolean;
  statusSince: Date;
  /** p90 of the stays in its column, in seconds; null below 10 of them. */
  p90Seconds: number | null;
  /** Pending blockers the reader can see. */
  openBlockers: number;
  now: Date;
}): PlanMark {
  if (task.status === "blocked") return "blocked";
  if (task.openBlockers > 0) return "waiting";
  const ageSeconds = (task.now.getTime() - task.statusSince.getTime()) / 1000;
  const fresh = task.p90Seconds === null || ageSeconds <= task.p90Seconds;
  return WORKING.has(task.status) && task.assigned && fresh
    ? "advancing"
    : "stalled";
}
