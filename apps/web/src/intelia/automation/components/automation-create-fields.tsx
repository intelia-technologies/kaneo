import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { AutomationDraftControl } from "../use-automation-draft";
import { AutomationFields } from "./automation-fields";
import "../i18n";

// The required level + verification choice of the task-creation forms.
export function AutomationCreateFields({
  control,
  disabled,
  className,
}: {
  control: AutomationDraftControl;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <AutomationFields
        value={control.draft}
        onChange={control.setDraft}
        disabled={disabled}
      />
      {!control.isValid && (
        <p
          role="status"
          className="flex items-center gap-1.5 text-destructive-foreground text-xs"
        >
          <CircleAlert aria-hidden="true" className="size-3.5" />
          {t("intelia:automation.required")}
        </p>
      )}
    </div>
  );
}
