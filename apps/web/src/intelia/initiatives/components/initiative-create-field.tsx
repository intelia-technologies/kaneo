import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";
import { InitiativePicker } from "./initiative-picker";
import { InitiativeRequiredReason } from "./initiative-required-reason";
import "../i18n";

export function InitiativeCreateField({
  projectId,
  value,
  onChange,
  disabled,
  showReason = true,
  className,
  id: customId,
}: {
  projectId: string | undefined;
  value: string | null;
  onChange: (initiativeId: string) => void;
  disabled?: boolean;
  showReason?: boolean;
  className?: string;
  id?: string;
}) {
  const { t } = useTranslation();
  const generatedId = useId();
  const id = customId ?? generatedId;
  const isMissing = !value;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-medium text-foreground">
        {t("intelia:initiative.title")}
      </Label>
      <InitiativePicker
        id={id}
        projectId={projectId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        invalid={isMissing}
      />
      {showReason && <InitiativeRequiredReason show={isMissing} />}
    </div>
  );
}
