import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import "../i18n";
import { useTaskOrigin } from "./origin-context";
import type { TaskOrigin } from "./origin";

const ORIGIN_STYLE: Record<TaskOrigin, { mark?: string; className: string }> = {
  plan: {
    mark: "▤",
    className: "border-chip-border bg-muted/40 text-chip-foreground",
  },
  añadido: {
    mark: "+",
    className: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  sin_registro: {
    className: "border-chip-border bg-muted/20 text-muted-foreground",
  },
};

// Design 19 annex §2: the task's origin in the initiative the «Tareas» tab
// shows. Nothing elsewhere, where no initiative provides the origins.
export function TaskOriginChip({
  taskId,
  className,
}: {
  taskId: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const origin = useTaskOrigin(taskId);
  if (!origin) return null;
  const style = ORIGIN_STYLE[origin];
  const label = t(`intelia:initiatives.origin.${origin}`);

  return (
    <span
      title={`${t("intelia:initiatives.originFilter")}: ${label}`}
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center gap-1 rounded-md border px-1.5 text-xs font-medium",
        style.className,
        className,
      )}
    >
      {style.mark && <span aria-hidden="true">{style.mark}</span>}
      {label}
    </span>
  );
}
