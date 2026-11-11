import { describe, expect, it } from "vite-plus/test";
import type { InitiativeCounters, InitiativeSummary } from "./api";
import {
  groupInitiatives,
  growthOf,
  matchesSearch,
  percentOf,
  sortInitiatives,
  statsOf,
} from "./progress";

const tally = (total: number, active = total, done = 0) => ({
  total,
  active,
  done,
});

function counters(over: Partial<InitiativeCounters> = {}): InitiativeCounters {
  return {
    total: 0,
    active: 0,
    done: 0,
    cancelled: 0,
    blocked: 0,
    plan: tally(0),
    added: tally(0),
    unrecorded: tally(0),
    hidden: tally(0),
    ...over,
  };
}

function initiative(
  name: string,
  state: InitiativeSummary["state"],
  over: Partial<InitiativeCounters> = {},
): InitiativeSummary {
  return {
    id: name,
    projectId: "p",
    name,
    objetivo: null,
    hitos_externos: null,
    estado_compartido: null,
    designUrl: null,
    approvedBy: null,
    approvedAt: null,
    createdByUserId: null,
    createdByName: null,
    createdByActor: null,
    source: "session",
    createdAt: "2026-11-01T00:00:00.000Z",
    planClosedAt: null,
    state,
    counters: counters(over),
    blockedTasks: [],
  };
}

describe("percentOf", () => {
  it("counts Done over active tasks, never Cancelled", () => {
    // Mock-up example: 12 tasks, 2 Cancelled, 5 Done → 5 / 10.
    expect(percentOf({ active: 10, done: 5 })).toBe(50);
  });

  it("has no percentage without active tasks (no tasks, all cancelled)", () => {
    expect(percentOf({ active: 0, done: 0 })).toBeNull();
  });

  it("only reaches 100 % when every active task is Done", () => {
    expect(percentOf({ active: 200, done: 199 })).toBe(99);
    expect(percentOf({ active: 3, done: 3 })).toBe(100);
  });
});

describe("growthOf", () => {
  it("grows in tasks, Cancelled included: 8 → 12 is +50 %", () => {
    expect(
      growthOf(counters({ plan: tally(8, 7, 4), added: tally(4, 3, 1) })),
    ).toEqual({ kind: "growth", from: 8, to: 12, percent: 50 });
  });

  it("shows no growth when some task is unrecorded (migrated)", () => {
    expect(
      growthOf(counters({ plan: tally(2), unrecorded: tally(3) })).kind,
    ).toBe("unrecorded");
  });

  it("has no base without a planned task", () => {
    expect(growthOf(counters({ added: tally(2) }))).toEqual({
      kind: "no_base",
      added: 2,
    });
    expect(growthOf(counters()).kind).toBe("none");
  });
});

describe("listing helpers", () => {
  const rows = [
    initiative("Beta", "in_flight", { active: 4, done: 3 }),
    initiative("alfa", "in_flight", { active: 4, done: 1 }),
    initiative("Zeta", "in_flight", { active: 2, done: 1, blocked: 1 }),
    initiative("Hecha", "finished", { active: 2, done: 2 }),
    initiative("Vacía", "no_tasks"),
    initiative("Anulada", "all_cancelled", { cancelled: 3 }),
  ];

  it("puts initiatives with Blocked tasks first, then by name", () => {
    const names = sortInitiatives(rows.slice(0, 3), "blocked").map(
      (row) => row.name,
    );
    expect(names).toEqual(["Zeta", "alfa", "Beta"]);
  });

  it("sorts by progress, least advanced first", () => {
    const names = sortInitiatives(rows.slice(0, 3), "progress").map(
      (row) => row.name,
    );
    expect(names).toEqual(["alfa", "Zeta", "Beta"]);
  });

  it("keeps finished apart from initiatives without active work", () => {
    const groups = groupInitiatives(rows);
    expect(groups.inFlight).toHaveLength(3);
    expect(groups.finished.map((row) => row.name)).toEqual(["Hecha"]);
    expect(groups.inactive.map((row) => row.name)).toEqual([
      "Vacía",
      "Anulada",
    ]);
  });

  it("sums the four figures over the initiatives in flight only", () => {
    const stats = statsOf([
      initiative("A", "in_flight", {
        blocked: 1,
        cancelled: 2,
        plan: tally(8),
        added: tally(4),
      }),
      initiative("B", "in_flight", { plan: tally(3) }),
      initiative("C", "all_cancelled", { cancelled: 5, plan: tally(5) }),
    ]);
    expect(stats).toEqual({
      inFlight: 2,
      withBlocked: 1,
      planned: 11,
      added: 4,
      cancelled: 2,
    });
  });

  it("searches names without case or accents", () => {
    expect(matchesSearch("Importación de pedidos", "IMPORTACION")).toBe(true);
    expect(matchesSearch("Motor de reglas", "pedidos")).toBe(false);
  });
});
