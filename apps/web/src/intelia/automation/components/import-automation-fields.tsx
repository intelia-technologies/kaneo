import { useTranslation } from "react-i18next";
import type { AutomationDraftControl } from "../use-automation-draft";
import { AutomationCreateFields } from "./automation-create-fields";
import "../i18n";

// The automation every task of a JSON import gets: required, nothing preselected.
export function ImportAutomationFields({
  control,
  disabled,
}: {
  control: AutomationDraftControl;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {t("intelia:automation.importAppliesToAll")}
      </p>
      <AutomationCreateFields control={control} disabled={disabled} />
    </div>
  );
}
