import { describe, expect, it } from "vite-plus/test";
import { planMark } from "./mark";

const now = new Date("2026-11-05T10:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

const base = {
  status: "in-progress",
  assigned: true,
  statusSince: hoursAgo(1),
  p90Seconds: 4 * 3600,
  openBlockers: 0,
  now,
};

describe("planMark", () => {
  it("marks each state of the annex of design 19 §3.2", () => {
    expect(planMark(base)).toBe("advancing");
    expect(planMark({ ...base, status: "in-review" })).toBe("advancing");
    expect(planMark({ ...base, status: "blocked", openBlockers: 1 })).toBe(
      "blocked",
    );
    expect(planMark({ ...base, status: "to-do", openBlockers: 2 })).toBe(
      "waiting",
    );
    expect(planMark({ ...base, status: "to-do" })).toBe("stalled");
    expect(planMark({ ...base, assigned: false })).toBe("stalled");
    expect(planMark({ ...base, statusSince: hoursAgo(5) })).toBe("stalled");
    expect(
      planMark({ ...base, statusSince: hoursAgo(50), p90Seconds: null }),
    ).toBe("advancing");
  });
});
