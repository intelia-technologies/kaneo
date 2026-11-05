import type { StatusAgeColumn } from "./api";

export type StatusAgeDuration = {
  value: number;
  unit: "minutes" | "hours" | "days";
};

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Design 23 §5: «45 min», «5 h» up to 48 h, then «3 d». Elapsed time is
// floored, so a chip never claims more time than has passed.
export function statusAgeDuration(seconds: number): StatusAgeDuration {
  const elapsed = Math.max(0, seconds);
  if (elapsed < HOUR) {
    return { value: Math.floor(elapsed / MINUTE), unit: "minutes" };
  }
  if (elapsed < 48 * HOUR) {
    return { value: Math.floor(elapsed / HOUR), unit: "hours" };
  }
  return { value: Math.floor(elapsed / DAY), unit: "days" };
}

export type StatusAgeTone =
  | "neutral"
  | "above-mean"
  | "above-p75"
  | "above-p90";

// Design 32 §4: with the factory's mean for the column (the one its rule R7
// compares against), amber above the mean and red when also above the p90.
// Without a mean, design 23 §4: amber above the column's p75, red above its
// p90; a column without percentiles (fewer than 10 cases) has no colour.
export function statusAgeTone(
  seconds: number,
  column: StatusAgeColumn | undefined,
  meanSeconds?: number | null,
): StatusAgeTone {
  const aboveP90 = column?.p90_s != null && seconds > column.p90_s;
  if (meanSeconds != null) {
    if (seconds <= meanSeconds) return "neutral";
    return aboveP90 ? "above-p90" : "above-mean";
  }
  if (column?.p75_s == null || column.p90_s == null) return "neutral";
  if (aboveP90) return "above-p90";
  if (seconds > column.p75_s) return "above-p75";
  return "neutral";
}
