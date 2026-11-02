import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import "../i18n";

export function InitiativeRequiredReason({
  show,
  className,
}: {
  show: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!show) return null;

  return (
    <p
      role="status"
      className={cn(
        "order-last flex items-center gap-1.5 text-destructive-foreground text-xs sm:order-none",
        className,
      )}
    >
      <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
      {t("intelia:initiative.required")}
    </p>
  );
}
