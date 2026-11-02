import { useTranslation } from "react-i18next";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { cn } from "@/lib/cn";
import {
  AUTOMATION_LEVELS,
  type AutomationDraft,
  isAutomationLevel,
  isLevelAllowed,
  isVerificationAllowed,
} from "../levels";
import "../i18n";

const VERIFICATION_OPTIONS = [
  { value: "yes", verification: true },
  { value: "no", verification: false },
] as const;

// The Fieldset's class wins over the rendered RadioGroup's, so the row
// layout of the options goes here.
const FIELDSET_CLASS = "max-w-none flex-row flex-wrap gap-x-4 gap-y-1.5";

// Level and verification, both required and with nothing preselected
// (design 18 §5.1). `completa` and "no verification" disable each other, so
// the draft can never hold `completa` without verification.
export function AutomationFields({
  value,
  onChange,
  disabled = false,
  showHints = false,
  className,
}: {
  value: AutomationDraft;
  onChange: (value: AutomationDraft) => void;
  disabled?: boolean;
  showHints?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const verificationValue =
    value.verification === null ? null : value.verification ? "yes" : "no";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Fieldset
        className={FIELDSET_CLASS}
        render={
          <RadioGroup
            disabled={disabled}
            value={value.level}
            onValueChange={(level) => {
              if (isAutomationLevel(level)) onChange({ ...value, level });
            }}
          />
        }
      >
        <FieldsetLegend className="w-full font-medium text-xs">
          {t("intelia:automation.level")}
        </FieldsetLegend>
        {AUTOMATION_LEVELS.map((level) => (
          <Label
            key={level}
            className="items-start gap-2 font-normal text-sm"
            title={
              isLevelAllowed(level, value.verification)
                ? t(`intelia:automation.levelHint.${level}`)
                : t("intelia:automation.completaNeedsVerification")
            }
          >
            <Radio
              value={level}
              disabled={!isLevelAllowed(level, value.verification)}
            />
            <span className="flex flex-col gap-0.5">
              {t(`intelia:automation.levels.${level}`)}
              {showHints && (
                <span className="text-muted-foreground text-xs">
                  {t(`intelia:automation.levelHint.${level}`)}
                </span>
              )}
            </span>
          </Label>
        ))}
      </Fieldset>
      <Fieldset
        className={FIELDSET_CLASS}
        render={
          <RadioGroup
            disabled={disabled}
            value={verificationValue}
            onValueChange={(selected) => {
              const option = VERIFICATION_OPTIONS.find(
                (candidate) => candidate.value === selected,
              );
              if (option) {
                onChange({ ...value, verification: option.verification });
              }
            }}
          />
        }
      >
        <FieldsetLegend className="w-full font-medium text-xs">
          {t("intelia:automation.verification")}
        </FieldsetLegend>
        {VERIFICATION_OPTIONS.map((option) => (
          <Label
            key={option.value}
            className="items-center gap-2 font-normal text-sm"
            title={
              isVerificationAllowed(option.verification, value.level)
                ? undefined
                : t("intelia:automation.completaNeedsVerification")
            }
          >
            <Radio
              value={option.value}
              disabled={
                !isVerificationAllowed(option.verification, value.level)
              }
            />
            {t(`intelia:automation.${option.value}`)}
          </Label>
        ))}
      </Fieldset>
      {value.level === "completa" && (
        <p className="text-muted-foreground text-xs">
          {t("intelia:automation.completaNeedsVerification")}
        </p>
      )}
    </div>
  );
}
