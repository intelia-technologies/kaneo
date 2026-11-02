import { useEffect } from "react";
import type { AutomationInput } from "../api";
import { useAutomationDraft } from "../use-automation-draft";
import { AutomationCreateFields } from "./automation-create-fields";

// Level + verification for an inline "add" row. The draft lives here, so it
// starts empty each time the row opens and is discarded when it closes; the
// row learns the value to send (null while incomplete) through `onChange`.
export function AutomationInputField({
  onChange,
  className = "px-1 pt-1",
}: {
  onChange: (input: AutomationInput | null) => void;
  className?: string;
}) {
  const control = useAutomationDraft();

  useEffect(() => {
    onChange(control.input);
    return () => onChange(null);
  }, [control.input, onChange]);

  return <AutomationCreateFields control={control} className={className} />;
}
