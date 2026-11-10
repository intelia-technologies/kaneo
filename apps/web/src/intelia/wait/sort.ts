import type Task from "@/types/task";
import type { WaitRoot } from "@/types/task/blockers-summary";
import { WAIT_REASONS, waitSummaryOf } from "./reasons";

type SortKey = Array<number | string>;

const ROOT_KIND_ORDER: Record<WaitRoot["kind"], number> = {
  task: 0,
  external: 1,
  cycle: 2,
  too_deep: 3,
};

/** Ascending: ready first, then by worsening reason and more blockers. */
export function waitSortKey(task: Task): SortKey | null {
  const summary = waitSummaryOf(task);
  if (!summary) return null;
  return [WAIT_REASONS.indexOf(summary.reason), summary.pendingCount];
}

/** Ascending: tasks sharing a root together, by its ticket, then the rest. */
export function rootSortKey(task: Task): SortKey | null {
  const root = waitSummaryOf(task)?.root;
  if (!root) return null;
  return [ROOT_KIND_ORDER[root.kind], root.task?.ticket ?? "", root.depth ?? 0];
}

export function compareSortKeys(a: SortKey, b: SortKey): number {
  for (let index = 0; index < a.length; index++) {
    const left = a[index];
    const right = b[index];
    const comparison =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), undefined, {
            numeric: true,
          });
    if (comparison !== 0) return comparison;
  }
  return 0;
}
