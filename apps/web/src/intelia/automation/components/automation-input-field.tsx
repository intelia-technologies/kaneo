import { useEffect } from "react";
import { cn } from "@/lib/cn";
import type { AutomationInput } from "../api";
import { useAutomationDraft } from "../use-automation-draft";
import { AutomationCreateFields } from "./automation-create-fields";
import { AutomationRequiredReason } from "./automation-required-reason";

// Automática, verification and delivery for an inline "add" row. The draft lives here, so it
// starts empty each time the row opens and is discarded when it closes; the
// row learns the value to send (null while incomplete) through `onChange`.
// The "choose the automation" reason comes first, right under the row's Add button,
// and the radio groups follow.
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

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <AutomationRequiredReason control={control} className="order-none" />
      <AutomationCreateFields control={control} showReason={false} />
    </div>
  );
}
