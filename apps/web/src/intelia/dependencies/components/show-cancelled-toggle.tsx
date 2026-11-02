import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";

export function ShowCancelledToggle({
  showCancelled,
  onCheckedChange,
}: {
  showCancelled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const id = useId();

  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm cursor-pointer select-none">
        {t("intelia:dependencies.showCancelled")}
      </label>
      <Switch
        id={id}
        checked={showCancelled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
