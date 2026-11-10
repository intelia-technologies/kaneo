import type { TaskAutomation } from "./api";

// Design 48 §3.2: on, off without a reason, off with one (paused), and the
// tasks that have no automation row.
export const AUTOMATION_FILTER_VALUES = [
  "automatica",
  "manual",
  "paused",
  "none",
] as const;

export type AutomationFilterValue = (typeof AUTOMATION_FILTER_VALUES)[number];

export function isAutomationFilterValue(
  value: unknown,
): value is AutomationFilterValue {
  return (AUTOMATION_FILTER_VALUES as readonly unknown[]).includes(value);
}

// `automation` is the task's row of the project map; a task without one
// matches only `none`.
export function automationFilterValue(
  automation: Pick<TaskAutomation, "automatica" | "pausaMotivo"> | undefined,
): AutomationFilterValue {
  if (!automation) return "none";
  if (automation.automatica) return "automatica";
  return automation.pausaMotivo ? "paused" : "manual";
}
