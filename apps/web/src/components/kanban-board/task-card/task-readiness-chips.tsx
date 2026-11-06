import { Ban, Hourglass, Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { taskChipClass } from "@/components/task-chips/task-chip-class";
import { cn } from "@/lib/cn";
import type Task from "@/types/task";

const typeLabels = {
  implementacion: "impl",
  validacion: "val",
  operacion: "oper",
  diseno: "dis",
} as const;

export function TaskReadinessChips({
  task,
  completed,
}: {
  task: Task;
  completed: boolean;
}) {
  const { t } = useTranslation();
  const summary = task.blockersSummary;
  const cancelled = summary?.hasCancelledBlocker;
  const tickets =
    summary?.blockers
      .filter((blocker) => !cancelled || blocker.status === "cancelled")
      .map((blocker) => blocker.ticket) ?? [];
  const external = summary?.externalCount ?? 0;
  const externalLabel =
    external > 0
      ? t("tasks:readiness.external", {
          count: external,
          defaultValue: "{{count}} de otro proyecto",
        })
      : "";
  const names = [tickets.join(", "), externalLabel].filter(Boolean).join(" y ");
  const waiting = summary && (summary.pendingCount > 0 || cancelled);
  const label = waiting
    ? cancelled
      ? t("tasks:readiness.cancelled", {
          blockers: names,
          defaultValue: "Bloqueante cancelado: {{blockers}}",
        })
      : t("tasks:readiness.blockers", {
          blockers: names,
          defaultValue: "Espera a {{blockers}}",
        })
    : summary?.waitingRelease
      ? t("tasks:readiness.release", { defaultValue: "Espera release" })
      : null;
  const Icon = cancelled ? Ban : waiting ? Hourglass : Rocket;

  return (
    <>
      {task.type && (
        <span className={cn(taskChipClass, "cursor-default")} title={task.type}>
          {typeLabels[task.type]}
        </span>
      )}
      {!completed && label && (
        <span
          className={cn(
            taskChipClass,
            "cursor-default",
            cancelled
              ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
              : waiting
                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
                : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
          )}
        >
          <Icon aria-hidden="true" />
          {label}
        </span>
      )}
    </>
  );
}
