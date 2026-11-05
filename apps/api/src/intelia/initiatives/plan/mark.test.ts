import { describe, expect, it } from "vite-plus/test";
import { planMark } from "./mark";

const now = new Date("2026-11-05T10:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

const working = { estado: "activo", trabajando: true } as const;

const base = {
  status: "in-progress",
  executor: "ephemeral",
  worker: working,
  statusSince: hoursAgo(1),
  p90Seconds: 4 * 3600,
  openBlockers: 0,
  now,
} as const;

const stalled = (stallReason: string) => ({ mark: "stalled", stallReason });

describe("planMark", () => {
  it("advances only with a live worker that is working, in In progress or In review", () => {
    expect(planMark(base)).toEqual({ mark: "advancing", stallReason: null });
    expect(planMark({ ...base, status: "in-review" }).mark).toBe("advancing");
    expect(planMark({ ...base, executor: "persistent" }).mark).toBe(
      "advancing",
    );
  });

  it("stalls an agent's task without a working worker, with the probable reason", () => {
    expect(planMark({ ...base, worker: null })).toEqual(stalled("no_worker"));
    expect(
      planMark({ ...base, worker: { estado: "caido", trabajando: false } }),
    ).toEqual(stalled("worker_down"));
    expect(
      planMark({ ...base, worker: { estado: "terminado", trabajando: false } }),
    ).toEqual(stalled("worker_finished"));
    expect(
      planMark({ ...base, worker: { estado: "activo", trabajando: false } }),
    ).toEqual(stalled("worker_idle"));
    expect(planMark({ ...base, executor: null })).toEqual(
      stalled("unassigned"),
    );
  });

  it("stalls past the column's p90 and when ready but not started", () => {
    expect(planMark({ ...base, statusSince: hoursAgo(5) })).toEqual(
      stalled("over_p90"),
    );
    expect(
      planMark({ ...base, statusSince: hoursAgo(50), p90Seconds: null }).mark,
    ).toBe("advancing");
    expect(planMark({ ...base, status: "to-do" })).toEqual(
      stalled("not_started"),
    );
    expect(planMark({ ...base, status: "to-do", worker: null })).toEqual(
      stalled("no_worker"),
    );
  });

  it("takes a person's assignment as all the signal there is", () => {
    expect(planMark({ ...base, executor: "person", worker: null }).mark).toBe(
      "advancing",
    );
  });

  it("marks Blocked and waiting before anything else", () => {
    expect(planMark({ ...base, status: "blocked", openBlockers: 1 })).toEqual({
      mark: "blocked",
      stallReason: null,
    });
    expect(
      planMark({ ...base, status: "to-do", openBlockers: 2, worker: null }),
    ).toEqual({ mark: "waiting", stallReason: null });
  });
});
