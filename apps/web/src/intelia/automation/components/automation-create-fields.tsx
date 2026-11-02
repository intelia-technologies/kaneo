import { cn } from "@/lib/cn";
import type { AutomationDraftControl } from "../use-automation-draft";
import { AutomationFields } from "./automation-fields";
import { AutomationRequiredReason } from "./automation-required-reason";
import "../i18n";

// The required level + verification choice of the task-creation forms.
// `showReason={false}` leaves the "choose a level" message to the caller, for
// forms that render it next to their own footer buttons.
export function AutomationCreateFields({
  control,
  disabled,
  showReason = true,
  className,
}: {
  control: AutomationDraftControl;
  disabled?: boolean;
  showReason?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <AutomationFields
        value={control.draft}
        onChange={control.setDraft}
        disabled={disabled}
      />
      {showReason && <AutomationRequiredReason control={control} />}
    </div>
  );
}
