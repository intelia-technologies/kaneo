// `revisar_el` is a calendar date, compared with today in Madrid (design 81
// §4.4): a pause must be reviewed some day after the one it is set on.
const TIMEZONE = "Europe/Madrid";
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today in Europe/Madrid, as YYYY-MM-DD. */
export function madridToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Whether the text is a real calendar date in YYYY-MM-DD. */
export function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export type RevisarElProblem = "missing" | "past" | null;

/** Why `revisarEl` cannot be set now, or null when it can. */
export function revisarElProblem(
  value: string | undefined,
  now = new Date(),
): RevisarElProblem {
  if (value === undefined || !isCalendarDate(value)) return "missing";
  // YYYY-MM-DD compares as text in calendar order.
  return value > madridToday(now) ? null : "past";
}
