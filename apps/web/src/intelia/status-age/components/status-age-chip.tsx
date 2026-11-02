import { Clock, ClockAlert, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { taskChipClass } from "@/components/task-chips/task-chip-class";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import useProjectStore from "@/store/project";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type Task from "@/types/task";
import { useProjectStatusAge } from "../api";
import {
  type StatusAgeDuration,
  type StatusAgeTone,
  statusAgeDuration,
  statusAgeTone,
} from "../status-age";
import { useMinuteClock } from "../use-minute-clock";

const TONE_ICON = {
  neutral: Clock,
  "above-p75": ClockAlert,
  "above-p90": TriangleAlert,
} as const;

const TONE_CLASS: Record<StatusAgeTone, string | undefined> = {
  neutral: undefined,
  "above-p75": "font-medium text-warning-foreground",
  "above-p90": "font-medium text-due-overdue",
};

// Design 23 §5: how long the task has been in its column, coloured against
// the column's own history and explained on hover. Tasks in Done and
// Cancelled are absent from the API's `tareas`, so they get no chip.
export function StatusAgeChip({
  task,
  isCompleted = false,
  className,
}: {
  task: Pick<Task, "id" | "projectId" | "status">;
  isCompleted?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const { showStatusAge } = useUserPreferencesStore();
  const columnName = useProjectStore(
    (state) =>
      state.project?.columns.find((column) => column.slug === task.status)
        ?.name,
  );
  const { data } = useProjectStatusAge(
    showStatusAge && !isCompleted ? task.projectId : undefined,
  );
  const now = useMinuteClock();

  const since = data?.tareas[task.id];
  if (!showStatusAge || isCompleted || !since) return null;

  const enteredAt = new Date(since);
  const seconds = Math.max(0, (now - enteredAt.getTime()) / 1000);
  const stats = data.columnas[task.status];
  const tone = statusAgeTone(seconds, stats);
  const Icon = TONE_ICON[tone];
  const column = columnName ?? task.status;
  const duration = (value: StatusAgeDuration) =>
    t(`tasks:statusAge.${value.unit}`, { value: value.value });
  const elapsed = duration(statusAgeDuration(seconds));

  const label = [
    t("tasks:statusAge.label", { duration: elapsed, column }),
    tone === "above-p75" && t("tasks:statusAge.aboveP75"),
    tone === "above-p90" && t("tasks:statusAge.aboveP90"),
  ]
    .filter(Boolean)
    .join(". ");

  const explanation = [
    t("tasks:statusAge.since", {
      column,
      date: formatDate(enteredAt, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    }),
    stats?.p75_s == null
      ? t("tasks:statusAge.noBase", { count: stats?.casos ?? 0 })
      : t("tasks:statusAge.usual", {
          duration: duration(statusAgeDuration(stats.p75_s)),
          cases: stats.casos,
        }),
  ].join(" ");

  return (
    <span
      role="img"
      aria-label={label}
      title={explanation}
      data-status-age-tone={tone}
      className={cn(
        taskChipClass,
        "cursor-default hover:border-chip-border hover:bg-transparent",
        className,
        TONE_CLASS[tone],
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(tone === "neutral" && "text-chip-icon")}
      />
      {elapsed}
    </span>
  );
}
