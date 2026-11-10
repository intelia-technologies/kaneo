import { useMemo, useState } from "react";
import type { AutomationInput } from "./api";
import {
  type AutomationDraft,
  EMPTY_AUTOMATION_DRAFT,
  toAutomationInput,
} from "./draft";

export interface AutomationDraftControl {
  draft: AutomationDraft;
  setDraft: (draft: AutomationDraft) => void;
  // The value to send, or null while the draft is incomplete or invalid.
  input: AutomationInput | null;
  // False while the creation form must stay blocked.
  isValid: boolean;
  // True when the person chose anything: the form has unsaved changes.
  isDirty: boolean;
  reset: () => void;
}

// State of the automation choice in a task-creation form: nothing is
// preselected, so the draft starts invalid and the form stays blocked until
// automática, verification and delivery are chosen.
export function useAutomationDraft(): AutomationDraftControl {
  const [draft, setDraft] = useState<AutomationDraft>(EMPTY_AUTOMATION_DRAFT);
  const input = useMemo(() => toAutomationInput(draft), [draft]);

  return {
    draft,
    setDraft,
    input,
    isValid: input !== null,
    isDirty: Object.values(draft).some((value) => value !== null),
    reset: () => setDraft(EMPTY_AUTOMATION_DRAFT),
  };
}
