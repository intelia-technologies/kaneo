import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { useTaskAliases } from "../api";
import "../i18n";
export function TaskAliases({
  taskId,
  className,
}: {
  taskId?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { data: aliases, isLoading, isError } = useTaskAliases(taskId);

  if (!taskId || isLoading || isError || !aliases || aliases.length === 0) {
    return null;
  }

  return (
    <p className={cn("text-muted-foreground text-xs", className)}>
      {aliases.map((alias, index) => (
        <span key={alias.ticketId} title={formatDateTime(alias.movedAt)}>
          {index > 0 && ", "}
          {t("intelia:aliases.formerly")}{" "}
          <span className="font-mono">{alias.ticketId}</span>
        </span>
      ))}
    </p>
  );
}
