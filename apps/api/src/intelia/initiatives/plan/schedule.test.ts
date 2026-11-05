import { describe, expect, it } from "vite-plus/test";
import { buildSchedule, type ScheduleNode } from "./schedule";

const now = new Date("2026-11-05T10:00:00Z");
const hoursAfter = (hours: number) =>
  new Date(now.getTime() + hours * 3_600_000);

function node(
  id: string,
  remainingHours: number,
  fields: Partial<ScheduleNode> = {},
): ScheduleNode {
  return {
    id,
    own: true,
    pending: true,
    remainingHours,
    actualStart: null,
    actualEnd: null,
    ...fields,
  };
}

const edge = (from: string, to: string) => ({ from, to });

describe("buildSchedule", () => {
  // a(2) → c(1) and b(5) → c: the chain through b has more hours, though
  // a comes first and both chains have two tasks.
  const nodes = [node("a", 2), node("b", 5), node("c", 1), node("d", 3)];
  const edges = [edge("a", "c"), edge("b", "c")];

  it("takes the chain with the most hours to the task that ends last", () => {
    const plan = buildSchedule(nodes, edges, now, null);
    expect(plan.critical).toEqual({ taskIds: ["b", "c"], hours: 6 });
    expect(plan.estimatedEnd).toEqual(hoursAfter(6));
    expect(plan.dates.get("c")).toEqual({
      plannedStart: hoursAfter(5),
      plannedEnd: hoursAfter(6),
    });
    expect(plan.dates.get("a")).toEqual({
      plannedStart: now,
      plannedEnd: hoursAfter(2),
    });
  });

  it("ends at the goal while it is pending, even if another task ends later", () => {
    const longer = [...nodes, node("e", 20)];
    const plan = buildSchedule(longer, [...edges, edge("d", "e")], now, "c");
    expect(plan.critical).toEqual({ taskIds: ["b", "c"], hours: 6 });

    const done = longer.map((n) =>
      n.id === "c" ? { ...n, pending: false, remainingHours: 0 } : n,
    );
    expect(buildSchedule(done, edges, now, "c").critical?.taskIds).toEqual([
      "e",
    ]);
  });

  it("ignores external tasks as the end, but chains through them", () => {
    const external = node("x", 10, { own: false });
    const plan = buildSchedule(
      [node("a", 2), external, node("y", 1, { own: false })],
      [edge("x", "a"), edge("a", "y")],
      now,
      null,
    );
    expect(plan.critical).toEqual({ taskIds: ["x", "a"], hours: 12 });
  });

  it("keeps real dates of finished tasks and starts started ones at their real start", () => {
    const started = new Date("2026-11-04T09:00:00Z");
    const plan = buildSchedule(
      [
        node("done", 0, {
          pending: false,
          actualStart: started,
          actualEnd: hoursAfter(-1),
        }),
        node("doing", 3, { actualStart: started }),
      ],
      [edge("done", "doing")],
      now,
      null,
    );
    expect(plan.dates.get("done")).toEqual({
      plannedStart: started,
      plannedEnd: hoursAfter(-1),
    });
    expect(plan.dates.get("doing")).toEqual({
      plannedStart: started,
      plannedEnd: hoursAfter(3),
    });
    expect(plan.critical?.taskIds).toEqual(["doing"]);
  });

  it("reports a cycle with no chain and no planned dates", () => {
    const plan = buildSchedule(
      [node("a", 1), node("b", 1)],
      [edge("a", "b"), edge("b", "a")],
      now,
      null,
    );
    expect(plan.critical).toBeNull();
    expect(plan.estimatedEnd).toBeNull();
    expect(plan.dates.get("a")).toEqual({
      plannedStart: null,
      plannedEnd: null,
    });
  });

  it("has no end when nothing is pending", () => {
    const plan = buildSchedule(
      [node("a", 0, { pending: false })],
      [],
      now,
      null,
    );
    expect(plan.critical).toEqual({ taskIds: [], hours: 0 });
    expect(plan.estimatedEnd).toBeNull();
  });
});
