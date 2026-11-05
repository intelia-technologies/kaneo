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
  "over_p90",
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
}): { mark: PlanMark; stallReason: StallReason | null } {
  if (task.status === "blocked") return { mark: "blocked", stallReason: null };
  if (task.openBlockers > 0) return { mark: "waiting", stallReason: null };
  const stalled = (stallReason: StallReason) =>
    ({ mark: "stalled", stallReason }) as const;
  if (task.executor === null) return stalled("unassigned");

  // An agent works only with a live worker that says it is working. A person
  // has no worker signal: being assigned is all Kaneo can see.
  if (task.executor !== "person") {
    if (!task.worker) return stalled("no_worker");
    if (task.worker.estado !== "activo" || !task.worker.trabajando) {
      return stalled(WORKER_REASON[task.worker.estado]);
    }
  }
  const ageSeconds = (task.now.getTime() - task.statusSince.getTime()) / 1000;
  if (task.p90Seconds !== null && ageSeconds > task.p90Seconds) {
    return stalled("over_p90");
  }
  return WORKING.has(task.status)
    ? { mark: "advancing", stallReason: null }
    : stalled("not_started");
}
