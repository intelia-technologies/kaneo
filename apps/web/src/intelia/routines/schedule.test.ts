import type { TFunction } from "i18next";
import { describe, expect, it } from "vite-plus/test";
import {
  cronFromSchedule,
  describeSchedule,
  type Schedule,
  scheduleFromCron,
} from "./schedule";

// Echo the key and options so the assertions read the chosen phrasing.
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as unknown as TFunction;

describe("cronFromSchedule and scheduleFromCron", () => {
  const shortcuts: Array<[Schedule, string]> = [
    [{ kind: "hours", every: 2 }, "0 */2 * * *"],
    [{ kind: "hours", every: 1 }, "0 * * * *"],
    [{ kind: "daily", hour: 9, minute: 30 }, "30 9 * * *"],
    [
      { kind: "weekdays", days: [1, 3, 5], hour: 18, minute: 0 },
      "0 18 * * 1,3,5",
    ],
  ];

  it.each(shortcuts)("round-trips %o as %s", (schedule, cron) => {
    expect(cronFromSchedule(schedule)).toBe(cron);
    expect(scheduleFromCron(cron)).toEqual(schedule);
  });

  it("sorts weekdays so the same days give the same cron", () => {
    expect(
      cronFromSchedule({ kind: "weekdays", days: [5, 1], hour: 8, minute: 5 }),
    ).toBe("5 8 * * 1,5");
  });

  it("reads day ranges and 7 as Sunday", () => {
    expect(scheduleFromCron("0 9 * * 1-5")).toEqual({
      kind: "weekdays",
      days: [1, 2, 3, 4, 5],
      hour: 9,
      minute: 0,
    });
    expect(scheduleFromCron("0 9 * * 6,7")).toEqual({
      kind: "weekdays",
      days: [0, 6],
      hour: 9,
      minute: 0,
    });
  });

  it("treats every day of the week as daily", () => {
    expect(scheduleFromCron("0 9 * * 0-6")).toEqual({
      kind: "daily",
      hour: 9,
      minute: 0,
    });
  });

  it.each([
    "*/15 * * * *",
    "15 */2 * * *",
    "0 */24 * * *",
    "0 9 1 * *",
    "0 9 * 1 *",
    "0 9-17 * * *",
    "0 9 * * MON",
    "0 9 * * 5-1",
    "60 9 * * *",
    "0 24 * * *",
    "0 9 * *",
    "@daily",
  ])("keeps %s as free cron", (cron) => {
    expect(scheduleFromCron(cron)).toEqual({ kind: "cron", cron });
  });

  it("normalises whitespace in free cron", () => {
    expect(cronFromSchedule({ kind: "cron", cron: " 0  9 1 * * " })).toBe(
      "0 9 1 * *",
    );
    expect(scheduleFromCron(" 0  */3 * * * ")).toEqual({
      kind: "hours",
      every: 3,
    });
  });
});

describe("describeSchedule", () => {
  it("counts hours", () => {
    expect(describeSchedule(t, "0 */2 * * *", "en-US")).toBe(
      'intelia:routines.describe.everyHours {"count":2}',
    );
  });

  it("lists weekdays from Monday with the local time", () => {
    expect(describeSchedule(t, "0 9 * * 0,1", "en-US")).toBe(
      'intelia:routines.describe.weekdays {"days":"Monday and Sunday","time":"09:00 AM"}',
    );
  });

  it("shows other expressions as cron", () => {
    expect(describeSchedule(t, "0 9 1 * *", "es-ES")).toBe(
      'intelia:routines.describe.cron {"cron":"0 9 1 * *"}',
    );
  });
});
