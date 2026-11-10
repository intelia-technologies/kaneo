import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { type AutomationDraft, DELIVERY_KINDS } from "../draft";
import "../i18n";
import { AutomationChoice } from "./automation-choice";

type YesNo = "yes" | "no";

const toYesNo = (value: boolean | null): YesNo | null =>
  value === null ? null : value ? "yes" : "no";

// Automática, verification and delivery (design 48 §3.2), all required and
// with nothing preselected (design 18 §5.1).
export function AutomationFields({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: AutomationDraft;
  onChange: (value: AutomationDraft) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const yesNo = [
    { value: "yes", label: t("intelia:automation.yes") },
    { value: "no", label: t("intelia:automation.no") },
  ] as const;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <AutomationChoice
        legend={t("intelia:automation.automatica")}
        options={yesNo}
        value={toYesNo(value.automatica)}
        onChange={(selected) =>
          onChange({ ...value, automatica: selected === "yes" })
        }
        disabled={disabled}
      />
      <AutomationChoice
        legend={t("intelia:automation.verification")}
        options={yesNo}
        value={toYesNo(value.verification)}
        onChange={(selected) =>
          onChange({ ...value, verification: selected === "yes" })
        }
        disabled={disabled}
      />
      <AutomationChoice
        legend={t("intelia:automation.entrega")}
        options={DELIVERY_KINDS.map((kind) => ({
          value: kind,
          label: t(`intelia:automation.card.entrega.${kind}`),
        }))}
        value={value.entrega}
        onChange={(entrega) => onChange({ ...value, entrega })}
        disabled={disabled}
      />
    </div>
  );
}
