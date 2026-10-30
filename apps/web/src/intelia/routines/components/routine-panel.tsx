import { CalendarClock, Pencil, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { SectionAddButton } from "@/components/task/sections/section-add-button";
import { SectionHeader } from "@/components/task/sections/section-header";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  type RoutineInput,
  useDeleteRoutine,
  useRoutineRuns,
  useSaveRoutine,
  useTaskRoutine,
} from "../api";
import "../i18n";
import {
  browserTimezone,
  cronFromSchedule,
  describeSchedule,
  type Schedule,
  scheduleFromCron,
} from "../schedule";
import { ActiveSwitch } from "./active-switch";
import { RoutineEditor } from "./routine-editor";
import { RunResult } from "./run-result";

const actionClass =
  "flex size-6.5 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-50";

export function TaskRoutinePanel({ taskId }: { taskId: string }) {
  const { t, i18n } = useTranslation();
  const switchId = useId();
  const { canUpdateTasks } = useWorkspacePermission();
  const canEdit = canUpdateTasks();
  const { data: task } = useGetTask(taskId);
  const { data: routine, isLoading, isError } = useTaskRoutine(taskId);
  const { data: runs = [] } = useRoutineRuns(taskId, !!routine);
  const save = useSaveRoutine();
  const remove = useDeleteRoutine();
  const [draft, setDraft] = useState<Schedule | null>(null);

  if (isLoading) return null;

  const hasRecurrence = !!task?.recurrence;
  const timezone = routine?.timezone ?? browserTimezone();

  // Every write control below is hidden or disabled without task:update; this
  // is the last guard so none of them can start the mutation.
  const submit = (input: RoutineInput, onSuccess?: () => void) => {
    if (!canEdit) return;
    save.mutate(
      { taskId, input },
      {
        onSuccess,
        onError: (error) =>
          toast.error(
            error instanceof Error && error.message
              ? error.message
              : t("intelia:routines.panel.saveError"),
          ),
      },
    );
  };

  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        title={t("intelia:routines.panel.title")}
        action={
          canEdit &&
          !draft &&
          (routine ? (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className={actionClass}
                aria-label={t("intelia:routines.panel.edit")}
                title={t("intelia:routines.panel.edit")}
                onClick={() => setDraft(scheduleFromCron(routine.cron))}
              >
                <Pencil aria-hidden="true" className="size-3.5" />
              </button>
              <button
                type="button"
                className={actionClass}
                aria-label={t("intelia:routines.panel.remove")}
                title={t("intelia:routines.panel.remove")}
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(taskId, {
                    onError: () =>
                      toast.error(t("intelia:routines.panel.removeError")),
                  })
                }
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          ) : (
            !hasRecurrence && (
              <SectionAddButton
                aria-label={t("intelia:routines.panel.schedule")}
                title={t("intelia:routines.panel.schedule")}
                onClick={() => setDraft(scheduleFromCron("0 */2 * * *"))}
              />
            )
          ))
        }
      />

      {draft ? (
        <RoutineEditor
          value={draft}
          timezone={timezone}
          isSaving={save.isPending}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() =>
            submit(
              {
                cron: cronFromSchedule(draft),
                timezone,
                active: routine?.active ?? true,
              },
              () => setDraft(null),
            )
          }
        />
      ) : isError ? (
        <p role="alert" className="px-2 py-1 text-destructive text-xs">
          {t("intelia:routines.panel.loadError")}
        </p>
      ) : routine ? (
        <div className="flex flex-col gap-2 px-2 py-1">
          <div className="flex items-center gap-2.5">
            <CalendarClock
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/85">
              {describeSchedule(t, routine.cron, i18n.language)}
            </span>
            <label htmlFor={switchId} className="text-muted-foreground text-xs">
              {routine.active
                ? t("intelia:routines.panel.active")
                : t("intelia:routines.panel.paused")}
            </label>
            <ActiveSwitch
              id={switchId}
              checked={routine.active}
              canEdit={canEdit}
              isSaving={save.isPending}
              onCheckedChange={(active) =>
                submit({ cron: routine.cron, timezone, active })
              }
            />
          </div>
          <p className="text-muted-foreground text-xs">
            {routine.active
              ? t("intelia:routines.panel.next", {
                  date: formatDateTime(routine.nextRunAt),
                })
              : t("intelia:routines.panel.paused")}
            {" · "}
            {t("intelia:routines.panel.timezone", { timezone })}
          </p>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">
              {t("intelia:routines.panel.recentRuns")}
            </span>
            {runs.length === 0 ? (
              <span className="text-muted-foreground/70 text-xs">
                {t("intelia:routines.panel.noRuns")}
              </span>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {runs.map((run) => (
                  <li
                    key={run.id}
                    className="flex items-center gap-2 text-xs"
                    title={run.error ?? undefined}
                  >
                    <span className="w-36 shrink-0 text-muted-foreground tabular-nums">
                      {formatDateTime(run.scheduledAt)}
                    </span>
                    <RunResult result={run.result} />
                    {run.closedAt && (
                      <span className="truncate text-muted-foreground/70">
                        {t("intelia:routines.panel.closedAt", {
                          date: formatDateTime(run.closedAt),
                        })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <p className="px-2 py-1 text-muted-foreground text-xs">
          {hasRecurrence
            ? t("intelia:routines.panel.hasRecurrence")
            : t("intelia:routines.panel.notScheduled")}
        </p>
      )}
    </section>
  );
}
