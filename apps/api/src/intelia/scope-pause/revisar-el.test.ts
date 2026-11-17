import { describe, expect, it } from "vite-plus/test";
import { isCalendarDate, madridToday, revisarElProblem } from "./revisar-el";

describe("revisarEl", () => {
  it("takes today from Madrid, not UTC", () => {
    // 23:30 UTC on 17-nov is already 18-nov in Madrid (UTC+1).
    expect(madridToday(new Date("2026-11-17T23:30:00Z"))).toBe("2026-11-18");
    expect(madridToday(new Date("2026-11-17T22:30:00Z"))).toBe("2026-11-17");
  });

  it("accepts only real dates in YYYY-MM-DD", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2026-2-28")).toBe(false);
    expect(isCalendarDate("2026-11-18T00:00:00Z")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
  });

  it("requires a date after today in Madrid", () => {
    const now = new Date("2026-11-17T10:00:00Z");
    expect(revisarElProblem(undefined, now)).toBe("missing");
    expect(revisarElProblem("mañana", now)).toBe("missing");
    expect(revisarElProblem("2026-11-16", now)).toBe("past");
    expect(revisarElProblem("2026-11-17", now)).toBe("past");
    expect(revisarElProblem("2026-11-18", now)).toBeNull();
    // Late evening UTC: Madrid is already on the 18th, so the 18th is today.
    expect(
      revisarElProblem("2026-11-18", new Date("2026-11-17T23:30:00Z")),
    ).toBe("past");
  });
});
