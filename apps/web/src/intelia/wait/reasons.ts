import type Task from "@/types/task";
import type {
  BlockerItem,
  BlockerState,
  BlockersSummary,
  WaitReason,
} from "@/types/task/blockers-summary";

// Best first: the order of the filter options and of an ascending sort.
export const WAIT_REASONS: readonly WaitReason[] = [
  "ready",
  "in_progress",
  "external",
  "not_started",
  "blocked",
  "person",
  "cancelled",
];

const RED = "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
const YELLOW =
  "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200";
const BLUE = "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200";
const GREEN =
  "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200";

// Design 55 §3.1: the colour of the worst reason.
export const WAIT_TONE_CLASS: Record<WaitReason, string> = {
  cancelled: RED,
  person: RED,
  blocked: YELLOW,
  not_started: YELLOW,
  external: YELLOW,
  in_progress: BLUE,
  ready: GREEN,
};

const STATE_SEVERITY: Record<BlockerState, number> = {
  cancelled: 0,
  person: 1,
  blocked: 2,
  not_started: 3,
  in_progress: 4,
};

/** The blockers, worst state first, so the label names the reason's own. */
export function blockersByWorstState(blockers: BlockerItem[]): BlockerItem[] {
  return [...blockers].sort(
    (a, b) => STATE_SEVERITY[a.state] - STATE_SEVERITY[b.state],
  );
}

/**
 * Design 55 §3.2: the wait label, root and filter only apply in To do; in
 * the other columns the card stays as before.
 */
export function waitSummaryOf(
  task: Pick<Task, "status" | "blockersSummary">,
): BlockersSummary | null {
  return task.status === "to-do" ? (task.blockersSummary ?? null) : null;
}
