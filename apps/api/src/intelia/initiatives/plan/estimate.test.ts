import { describe, expect, it } from "vite-plus/test";
import { estimateHours, median, remainingHours, type Sample } from "./estimate";

const sample = (fields: Partial<Sample> & { hours: number }): Sample => ({
  projectId: "sf",
  level: "completa",
  kind: "ephemeral",
  ...fields,
});

const key = { projectId: "sf", level: "completa", kind: "ephemeral" } as const;

describe("estimateHours", () => {
  it("uses the project's median of tasks with the same level and executor, from 10", () => {
    const samples = [
      ...Array.from({ length: 10 }, (_, i) => sample({ hours: i + 1 })),
      sample({ hours: 100, level: "arranque" }),
      sample({ hours: 100, kind: "person" }),
      sample({ hours: 100, projectId: "other" }),
    ];
    expect(estimateHours(key, null, samples)).toEqual({
      hours: 5.5,
      source: "project",
      cases: 10,
    });
  });

  it("widens to the workspace with 9 cases in the project", () => {
    const samples = [
      ...Array.from({ length: 9 }, () => sample({ hours: 2 })),
      sample({ hours: 30, projectId: "other" }),
      sample({ hours: 30, projectId: "other" }),
    ];
    expect(estimateHours(key, null, samples)).toEqual({
      hours: 2,
      source: "org",
      cases: 11,
    });
  });

  it("falls back to 4 h with fewer than 10 alike in the workspace", () => {
    expect(estimateHours(key, null, [])).toEqual({
      hours: 4,
      source: "default",
      cases: 0,
    });
    const nine = Array.from({ length: 9 }, () => sample({ hours: 1 }));
    expect(estimateHours(key, null, nine).source).toBe("default");
  });

  it("lets a manual estimate win", () => {
    const samples = Array.from({ length: 12 }, () => sample({ hours: 1 }));
    expect(estimateHours(key, 7.5, samples)).toEqual({
      hours: 7.5,
      source: "manual",
      cases: 0,
    });
  });

  it("matches any executor when the task is unassigned, and no level only with no level", () => {
    const samples = [
      ...Array.from({ length: 5 }, () => sample({ hours: 3, kind: "person" })),
      ...Array.from({ length: 5 }, () => sample({ hours: 3 })),
      ...Array.from({ length: 10 }, () => sample({ hours: 9, level: null })),
    ];
    expect(estimateHours({ ...key, kind: null }, null, samples)).toMatchObject({
      hours: 3,
      cases: 10,
    });
    expect(
      estimateHours({ ...key, level: null, kind: null }, null, samples),
    ).toMatchObject({ hours: 9, cases: 10 });
  });
});

describe("remainingHours", () => {
  it("is the estimate minus the work, at least 1 h, once started", () => {
    expect(remainingHours(6, 3, true)).toBe(3);
    expect(remainingHours(6, 8, true)).toBe(1);
    expect(remainingHours(6, 0, false)).toBe(6);
  });
});

describe("median", () => {
  it("takes the middle value or the mean of the two middle ones", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
