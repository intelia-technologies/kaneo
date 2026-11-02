import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { AutomationDraftControl } from "../use-automation-draft";
import "../i18n";

// Why a task-creation form is blocked: the level is still to be chosen.
// Forms with a footer render it there, next to the buttons, so it stays
// visible without scrolling on small screens. The footer stacks reversed on
// mobile, so `order-last` puts the message right above the buttons there and
// `sm:order-none` leaves it in source order on the row layout.
export function AutomationRequiredReason({
  control,
  className,
}: {
  control: AutomationDraftControl;
  className?: string;
}) {
  const { t } = useTranslation();

  if (control.isValid) return null;

  return (
    <p
      role="status"
      className={cn(
        "order-last flex items-center gap-1.5 text-destructive-foreground text-xs sm:order-none",
        className,
      )}
    >
      <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
      {t("intelia:automation.required")}
    </p>
  );
}
