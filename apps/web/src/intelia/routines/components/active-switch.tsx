import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";

type ActiveSwitchProps = {
  id?: string;
  checked: boolean;
  canEdit: boolean;
  isSaving: boolean;
  "aria-label"?: string;
  onCheckedChange: (active: boolean) => void;
};

// Pause or activate a routine. Without task:update the switch is disabled,
// explains why on hover, and never starts the mutation.
export function ActiveSwitch({
  canEdit,
  isSaving,
  onCheckedChange,
  ...props
}: ActiveSwitchProps) {
  const { t } = useTranslation();
  const toggle = (
    <Switch
      {...props}
      disabled={!canEdit || isSaving}
      onCheckedChange={(active) => {
        if (canEdit) onCheckedChange(active);
      }}
    />
  );
  if (canEdit) return toggle;

  // A disabled control gets no pointer events: the tooltip hangs off a wrapper.
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        {toggle}
      </TooltipTrigger>
      <TooltipPopup>{t("intelia:routines.noPermission")}</TooltipPopup>
    </Tooltip>
  );
}
