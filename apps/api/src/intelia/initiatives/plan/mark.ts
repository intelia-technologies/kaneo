import type { ExecutorKind } from "./executor";

// Annex of design 19 §3.2: how each pending task stands.
export const PLAN_MARKS = [
  "advancing",
  "blocked",
  "stalled",
  "waiting",
] as const;
export type PlanMark = (typeof PLAN_MARKS)[number];

// The probable reason of a stalled task, from what Kaneo knows: its assignee,
// the worker the factory's dispatcher reports in the board signals (RT-05)
// and the column's p90 (design 23). The first that applies, in this order.
export const STALL_REASONS = [
  "unassigned",
  "no_worker",
  "worker_down",
  "worker_finished",
  "worker_idle",
  "not_started",
] as const;
export type StallReason = (typeof STALL_REASONS)[number];

/** The worker of a board signal no older than 10 minutes, as the card shows it. */
export type WorkerSignal = {
  estado: "activo" | "caido" | "terminado";
  trabajando: boolean;
};

const WORKING = new Set(["in-progress", "in-review"]);

const WORKER_REASON: Record<WorkerSignal["estado"], StallReason> = {
  activo: "worker_idle",
  caido: "worker_down",
  terminado: "worker_finished",
};

export function planMark(task: {
  status: string;
  /** Null when unassigned. */
  executor: ExecutorKind | null;
  /** Null without a worker in a fresh board signal. */
  worker: WorkerSignal | null;
  statusSince: Date;
  /** p90 of the stays in its column, in seconds; null below 10 of them. */
  p90Seconds: number | null;
  /** Pending blockers the reader can see. */
  openBlockers: number;
  now: Date;
}): { mark: PlanMark | null; stallReason: StallReason | null } {
  if (task.status === "blocked") return { mark: "blocked", stallReason: null };
  if (task.openBlockers > 0) return { mark: "waiting", stallReason: null };
  const stalled = (stallReason: StallReason) =>
    ({ mark: "stalled", stallReason }) as const;
  const unmarked = { mark: null, stallReason: null } as const;

  // Only a role's ready To do task or an In progress task without anyone
  // working is stalled. Backlog and Design are not ready.
  if (task.status === "to-do") {
    return task.executor === "ephemeral" ? stalled("not_started") : unmarked;
  }
  if (!WORKING.has(task.status)) return unmarked;

  const mayStall = task.status === "in-progress";
  if (task.executor === null)
    return mayStall ? stalled("unassigned") : unmarked;
  if (task.executor !== "person") {
    if (!task.worker) return mayStall ? stalled("no_worker") : unmarked;
    if (task.worker.estado !== "activo" || !task.worker.trabajando) {
      return mayStall ? stalled(WORKER_REASON[task.worker.estado]) : unmarked;
    }
  }
  // Kaneo has no worker signal for people; an assigned person is its only
  // available evidence of work. Old activity is not evidence of a stall.
  const ageSeconds = (task.now.getTime() - task.statusSince.getTime()) / 1000;
  if (task.p90Seconds !== null && ageSeconds > task.p90Seconds) return unmarked;
  return { mark: "advancing", stallReason: null };
}
