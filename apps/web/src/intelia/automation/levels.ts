import type { AutomationInput, AutomationLevel } from "./api";

export const AUTOMATION_LEVELS = [
  "manual",
  "arranque",
  "completa",
] as const satisfies readonly AutomationLevel[];

// What a form holds while a person chooses: nothing is preselected
// (design 18 §5.1), so both start empty.
export type AutomationDraft = {
  level: AutomationLevel | null;
  verification: boolean | null;
};

export const EMPTY_AUTOMATION_DRAFT: AutomationDraft = {
  level: null,
  verification: null,
};

export function isAutomationLevel(value: unknown): value is AutomationLevel {
  return (AUTOMATION_LEVELS as readonly unknown[]).includes(value);
}

// `completa` needs verification: neither field may be set to break that.
export function isLevelAllowed(
  level: AutomationLevel,
  verification: boolean | null,
): boolean {
  return level !== "completa" || verification !== false;
}

export function isVerificationAllowed(
  verification: boolean,
  level: AutomationLevel | null,
): boolean {
  return verification || level !== "completa";
}

// The value to send, or null while the draft is incomplete or invalid.
export function toAutomationInput(
  draft: AutomationDraft,
): AutomationInput | null {
  const { level, verification } = draft;
  if (level === null || verification === null) return null;
  if (level === "completa") {
    return verification ? { level, verification: true } : null;
  }
  return { level, verification };
}
