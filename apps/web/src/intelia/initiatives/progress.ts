import type { InitiativeCounters, InitiativeSummary } from "./api";

// Progress rules of design 19 §5 (and the mock-up's notes). The API already
// counts: only Done is done, Cancelled is neither in `done` nor in `active`.
// These helpers only decide what can be shown; the views never print a
// percentage without «done / active» and the cancelled next to it.

type Tally = { active: number; done: number };

/**
 * Whole percentage of the active tasks that are Done, or null when there is
 * no active task: «sin tareas» and «todas canceladas» never show 0 % or
 * 100 %. Rounded down, so 100 % means every active task is Done.
 */
export function percentOf({ active, done }: Tally): number | null {
  if (active <= 0) return null;
  return Math.floor((done / active) * 100);
}

export type Growth =
  /** Migrated tasks (`sin_registro`): the plan is unknown, so no growth. */
  | { kind: "unrecorded" }
  /** No task at all in the plan or added. */
  | { kind: "none" }
  /** Added tasks without any planned one: «Sin base original · +N». */
  | { kind: "no_base"; added: number }
  /** Plan total → plan + added, in tasks, never effort. */
  | { kind: "growth"; from: number; to: number; percent: number };

/**
 * Growth in number of tasks, cancelled ones included (they keep their
 * origin): 8 planned and 4 added is «8 → 12, +50 %».
 */
export function growthOf(counters: InitiativeCounters): Growth {
  if (counters.unrecorded.total > 0) return { kind: "unrecorded" };
  const planned = counters.plan.total;
  const added = counters.added.total;
  if (planned === 0) {
    return added > 0 ? { kind: "no_base", added } : { kind: "none" };
  }
  return {
    kind: "growth",
    from: planned,
    to: planned + added,
    percent: Math.round((added / planned) * 100),
  };
}

export type InitiativeSort = "blocked" | "name" | "progress";
export const INITIATIVE_SORTS: readonly InitiativeSort[] = [
  "blocked",
  "name",
  "progress",
];

const byName = (a: InitiativeSummary, b: InitiativeSummary) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/**
 * Default: initiatives with Blocked tasks first, then by name. «progress»
 * puts the least advanced first, the ones that need a look.
 */
export function sortInitiatives(
  initiatives: readonly InitiativeSummary[],
  sort: InitiativeSort,
): InitiativeSummary[] {
  const rows = [...initiatives];
  if (sort === "name") return rows.sort(byName);
  if (sort === "progress") {
    return rows.sort(
      (a, b) =>
        (percentOf(a.counters) ?? -1) - (percentOf(b.counters) ?? -1) ||
        byName(a, b),
    );
  }
  return rows.sort(
    (a, b) =>
      Number(b.counters.blocked > 0) - Number(a.counters.blocked > 0) ||
      byName(a, b),
  );
}

export type InitiativeGroups = {
  inFlight: InitiativeSummary[];
  finished: InitiativeSummary[];
  /** No tasks or every task Cancelled: no active work, not finished. */
  inactive: InitiativeSummary[];
};

export function groupInitiatives(
  initiatives: readonly InitiativeSummary[],
): InitiativeGroups {
  const groups: InitiativeGroups = { inFlight: [], finished: [], inactive: [] };
  for (const initiative of initiatives) {
    if (initiative.state === "in_flight") groups.inFlight.push(initiative);
    else if (initiative.state === "finished") groups.finished.push(initiative);
    else groups.inactive.push(initiative);
  }
  return groups;
}

export type InitiativeStats = {
  inFlight: number;
  withBlocked: number;
  planned: number;
  added: number;
  cancelled: number;
};

/** The four figures above the listing, over the initiatives in flight. */
export function statsOf(
  initiatives: readonly InitiativeSummary[],
): InitiativeStats {
  const stats: InitiativeStats = {
    inFlight: 0,
    withBlocked: 0,
    planned: 0,
    added: 0,
    cancelled: 0,
  };
  for (const { state, counters } of initiatives) {
    if (state !== "in_flight") continue;
    stats.inFlight += 1;
    if (counters.blocked > 0) stats.withBlocked += 1;
    stats.planned += counters.plan.total;
    stats.added += counters.added.total;
    stats.cancelled += counters.cancelled;
  }
  return stats;
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();

/** Search by name, ignoring case and accents, as names are unique. */
export function matchesSearch(name: string, query: string): boolean {
  const needle = normalize(query.trim());
  return needle === "" || normalize(name).includes(needle);
}
