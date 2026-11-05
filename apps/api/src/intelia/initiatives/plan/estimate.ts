import type { AutomationLevel } from "../../schema";
import type { ExecutorKind } from "./executor";

// Annex of design 19 §3.3: the median of similar finished tasks, from 10 of
// them; first in the task's project, then in every readable project of the
// workspace; with fewer, 4 h. A manual `estimacion_horas` wins.
export const MIN_CASES = 10;
export const DEFAULT_HOURS = 4;
// A task already in progress has at least this much left.
export const MIN_REMAINING_HOURS = 1;

export const ESTIMATE_SOURCES = [
  "manual",
  "project",
  "org",
  "default",
] as const;
export type EstimateSource = (typeof ESTIMATE_SOURCES)[number];

/** A finished task: where it was, who did it and how long it took. */
export type Sample = {
  projectId: string;
  level: AutomationLevel | null;
  kind: ExecutorKind | null;
  hours: number;
};

/** What makes two tasks alike. A null kind (unassigned) matches any kind. */
export type EstimateKey = {
  projectId: string;
  level: AutomationLevel | null;
  kind: ExecutorKind | null;
};

export type Estimate = {
  hours: number;
  source: EstimateSource;
  /** Finished tasks behind the median; 0 for manual and default. */
  cases: number;
};

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const alike = (key: EstimateKey) => (sample: Sample) =>
  sample.level === key.level && (key.kind === null || sample.kind === key.kind);

/**
 * The estimate of one task. `samples` must hold only tasks the reader can
 * read: the caller filters them, never this function.
 */
export function estimateHours(
  key: EstimateKey,
  manualHours: number | null,
  samples: Sample[],
): Estimate {
  if (manualHours !== null) {
    return { hours: manualHours, source: "manual", cases: 0 };
  }
  const org = samples.filter(alike(key));
  const project = org.filter((sample) => sample.projectId === key.projectId);
  if (project.length >= MIN_CASES) {
    return {
      hours: median(project.map((s) => s.hours)),
      source: "project",
      cases: project.length,
    };
  }
  if (org.length >= MIN_CASES) {
    return {
      hours: median(org.map((s) => s.hours)),
      source: "org",
      cases: org.length,
    };
  }
  return { hours: DEFAULT_HOURS, source: "default", cases: 0 };
}

/** Hours left: the estimate minus the work done, at least 1 h once started. */
export function remainingHours(
  estimate: number,
  workedHours: number,
  started: boolean,
): number {
  if (!started) return estimate;
  return Math.max(estimate - workedHours, MIN_REMAINING_HOURS);
}

/** `estimacion_horas` as stored (text): a positive number, or null. */
export function parseManualHours(value: string | null | undefined) {
  if (value === null || value === undefined) return null;
  const hours = Number(value.trim().replace(",", "."));
  return value.trim() !== "" && Number.isFinite(hours) && hours > 0
    ? hours
    : null;
}
