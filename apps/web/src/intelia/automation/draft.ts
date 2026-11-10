import type { AutomationInput, DeliveryKind } from "./api";

export const DELIVERY_KINDS = [
  "pr",
  "sin_pr",
] as const satisfies readonly DeliveryKind[];

// What a form holds while a person chooses (design 48 §3.2): nothing is
// preselected (design 18 §5.1), so all three start empty.
export type AutomationDraft = {
  automatica: boolean | null;
  verification: boolean | null;
  entrega: DeliveryKind | null;
};

export const EMPTY_AUTOMATION_DRAFT: AutomationDraft = {
  automatica: null,
  verification: null,
  entrega: null,
};

export function isDeliveryKind(value: unknown): value is DeliveryKind {
  return (DELIVERY_KINDS as readonly unknown[]).includes(value);
}

// The value to send when creating a task, or null while the draft is
// incomplete.
export function toAutomationInput(
  draft: AutomationDraft,
): AutomationInput | null {
  const { automatica, verification, entrega } = draft;
  if (automatica === null || verification === null || entrega === null) {
    return null;
  }
  return { automatica, verification, entrega };
}
