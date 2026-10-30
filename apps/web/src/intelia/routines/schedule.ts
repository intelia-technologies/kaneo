import type { TFunction } from "i18next";
import { formatWeekday } from "@/lib/format-recurrence";

// The shortcuts the panel offers, each a five-field cron expression (minute
// hour day-of-month month day-of-week). Anything else stays as free cron.
export type Schedule =
  | { kind: "hours"; every: number }
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "weekdays"; days: number[]; hour: number; minute: number }
  | { kind: "cron"; cron: string };

export type ScheduleKind = Schedule["kind"];

export const SCHEDULE_KINDS: ScheduleKind[] = [
  "hours",
  "daily",
  "weekdays",
  "cron",
];

export const MAX_EVERY_HOURS = 23;

const NUMBER = /^\d{1,2}$/;

function parseNumber(field: string, max: number): number | null {
  if (!NUMBER.test(field)) return null;
  const value = Number(field);
  return value <= max ? value : null;
}

// Day-of-week lists such as `1,3,5`, `1-5` or `0,6`; 7 is Sunday too.
function parseDays(field: string): number[] | null {
  const days = new Set<number>();
  for (const part of field.split(",")) {
    const [from, to, extra] = part.split("-");
    if (extra !== undefined) return null;
    const start = parseNumber(from, 7);
    const end = to === undefined ? start : parseNumber(to, 7);
    if (start === null || end === null || end < start) return null;
    for (let day = start; day <= end; day++) days.add(day % 7);
  }
  return [...days].sort((a, b) => a - b);
}

export function scheduleFromCron(cron: string): Schedule {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return { kind: "cron", cron: cron.trim() };
  const [minuteField, hourField, dayOfMonth, month, dayOfWeek] = fields;
  const custom: Schedule = { kind: "cron", cron: fields.join(" ") };
  if (dayOfMonth !== "*" || month !== "*") return custom;

  if (minuteField === "0" && dayOfWeek === "*") {
    if (hourField === "*") return { kind: "hours", every: 1 };
    const step = /^\*\/(\d{1,2})$/.exec(hourField);
    const every = step ? Number(step[1]) : 0;
    if (every >= 1 && every <= MAX_EVERY_HOURS) return { kind: "hours", every };
  }

  const minute = parseNumber(minuteField, 59);
  const hour = parseNumber(hourField, 23);
  if (minute === null || hour === null) return custom;
  if (dayOfWeek === "*") return { kind: "daily", hour, minute };

  const days = parseDays(dayOfWeek);
  if (!days || days.length === 0) return custom;
  if (days.length === 7) return { kind: "daily", hour, minute };
  return { kind: "weekdays", days, hour, minute };
}

export function cronFromSchedule(schedule: Schedule): string {
  switch (schedule.kind) {
    case "hours":
      return schedule.every === 1 ? "0 * * * *" : `0 */${schedule.every} * * *`;
    case "daily":
      return `${schedule.minute} ${schedule.hour} * * *`;
    case "weekdays":
      return `${schedule.minute} ${schedule.hour} * * ${[...schedule.days]
        .sort((a, b) => a - b)
        .join(",")}`;
    case "cron":
      return schedule.cron.trim().split(/\s+/).join(" ");
  }
}

export function formatTime(hour: number, minute: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 1, hour, minute)));
}

// Monday first, as people read a working week.
function formatDays(days: number[], locale: string) {
  const names = [...days]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((day) => formatWeekday(day, locale));
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(names);
}

export function describeSchedule(
  t: TFunction,
  cron: string,
  locale: string,
): string {
  const schedule = scheduleFromCron(cron);
  switch (schedule.kind) {
    case "hours":
      return t("intelia:routines.describe.everyHours", {
        count: schedule.every,
      });
    case "daily":
      return t("intelia:routines.describe.daily", {
        time: formatTime(schedule.hour, schedule.minute, locale),
      });
    case "weekdays":
      return t("intelia:routines.describe.weekdays", {
        days: formatDays(schedule.days, locale),
        time: formatTime(schedule.hour, schedule.minute, locale),
      });
    case "cron":
      return t("intelia:routines.describe.cron", { cron: schedule.cron });
  }
}

export function defaultSchedule(kind: ScheduleKind): Schedule {
  switch (kind) {
    case "hours":
      return { kind, every: 2 };
    case "daily":
      return { kind, hour: 9, minute: 0 };
    case "weekdays":
      return { kind, days: [1, 2, 3, 4, 5], hour: 9, minute: 0 };
    case "cron":
      return { kind, cron: "0 */2 * * *" };
  }
}

export function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
