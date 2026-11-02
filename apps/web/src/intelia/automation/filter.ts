import { AUTOMATION_LEVELS } from "./levels";

// The filter value for tasks that have no level yet.
export const NO_AUTOMATION_LEVEL = "none";

export const AUTOMATION_FILTER_VALUES = [
  ...AUTOMATION_LEVELS,
  NO_AUTOMATION_LEVEL,
] as const;

// `automation` is the task's row of the project map; a task without a level
// has none and matches only the `none` value.
export function matchesAutomationFilter(
  selected: readonly string[],
  automation: { level: string } | undefined,
): boolean {
  return selected.includes(automation?.level ?? NO_AUTOMATION_LEVEL);
}
