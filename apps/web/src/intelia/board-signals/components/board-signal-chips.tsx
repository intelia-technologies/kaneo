import { AlarmClock, Bot, BotOff, Hourglass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { taskChipClass } from "@/components/task-chips/task-chip-class";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import type Task from "@/types/task";
import { useMinuteClock } from "../../status-age/use-minute-clock";
import { useProjectBoardSignals } from "../api";

// The factory reports every 2 minutes; older than this, what it said about
// the worker may no longer hold, so the card stops showing it. An alarm is a
// date set in advance and stays.
export const WORKER_STALE_MS = 10 * 60 * 1000;

const WORKER_CLASS = {
  activo: "text-success-foreground",
  caido: "font-medium text-due-overdue",
  terminado: "text-chip-icon",
} as const;

const chipClass = cn(
  taskChipClass,
  "cursor-default hover:border-chip-border hover:bg-transparent",
);

const dateTime = (iso: string) =>
  formatDate(new Date(iso), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// Design 32 §4: on the card, whether the task's worker is alive or down, and
// its alarm (or, without one, who it waits for), as the factory last reported
// them. Nothing for tasks it said nothing about.
export function BoardSignalChips({
  task,
}: {
  task: Pick<Task, "id" | "projectId">;
}) {
  const { t } = useTranslation();
  const { data } = useProjectBoardSignals(task.projectId);
  const now = useMinuteClock();
  const signal = data?.tareas[task.id];
  if (!data?.calculado_en || !signal) return null;

  const fresh = now - new Date(data.calculado_en).getTime() <= WORKER_STALE_MS;
  const worker = fresh ? signal.worker : null;
  const waitsFor = signal.espera_a
    ? t("tasks:boardSignals.waitsFor", { who: signal.espera_a })
    : null;

  return (
    <>
      {worker && (
        <span
          role="img"
          data-worker-state={worker.estado}
          aria-label={t(`tasks:boardSignals.worker.${worker.estado}`)}
          title={[
            t(`tasks:boardSignals.worker.${worker.estado}`),
            worker.trabajando && t("tasks:boardSignals.worker.working"),
            `${worker.instancia} (${worker.rol}).`,
            worker.ultima_senal &&
              t("tasks:boardSignals.worker.lastSignal", {
                date: dateTime(worker.ultima_senal),
              }),
          ]
            .filter(Boolean)
            .join(" ")}
          className={cn(chipClass, WORKER_CLASS[worker.estado])}
        >
          {worker.estado === "caido" ? (
            <BotOff aria-hidden="true" />
          ) : (
            <Bot aria-hidden="true" />
          )}
          {t(`tasks:boardSignals.worker.short.${worker.estado}`)}
        </span>
      )}
      {signal.alarma ? (
        <span
          role="img"
          data-board-signal="alarma"
          aria-label={t("tasks:boardSignals.alarm", {
            date: dateTime(signal.alarma.cuando),
          })}
          title={[
            t("tasks:boardSignals.alarm", {
              date: dateTime(signal.alarma.cuando),
            }),
            signal.alarma.motivo,
            waitsFor,
          ]
            .filter(Boolean)
            .join(" · ")}
          className={chipClass}
        >
          <AlarmClock aria-hidden="true" className="text-chip-icon" />
          {dateTime(signal.alarma.cuando)}
        </span>
      ) : (
        waitsFor && (
          <span
            role="img"
            data-board-signal="espera"
            aria-label={waitsFor}
            title={waitsFor}
            className={chipClass}
          >
            <Hourglass aria-hidden="true" className="text-chip-icon" />
            <span className="max-w-28 truncate">{signal.espera_a}</span>
          </span>
        )
      )}
    </>
  );
}
