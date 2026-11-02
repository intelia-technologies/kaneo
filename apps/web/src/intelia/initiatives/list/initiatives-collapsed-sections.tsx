import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { InitiativeSummary, TaskWithoutInitiative } from "../api";
import { ProgressFigures } from "../components/initiative-progress";
import { formatTaskIdentifier, resolveColumnName } from "./format-helpers";
import "./i18n";

type InitiativesCollapsedSectionsProps = {
  finished: readonly InitiativeSummary[];
  inactive: readonly InitiativeSummary[];
  withoutInitiative: readonly TaskWithoutInitiative[];
  projectSlug?: string | null;
  columns?: readonly { id?: string; slug?: string; name: string }[] | null;
  onOpenInitiative: (initiativeId: string) => void;
  onOpenTask: (taskId: string) => void;
};

export function InitiativesCollapsedSections({
  finished,
  inactive,
  withoutInitiative,
  projectSlug,
  columns,
  onOpenInitiative,
  onOpenTask,
}: InitiativesCollapsedSectionsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      {finished.length > 0 && (
        <details className="group rounded-xl border border-border bg-card/40 p-4 transition-all">
          <summary className="flex cursor-pointer select-none items-center justify-between font-medium text-muted-foreground text-sm hover:text-foreground">
            <span>
              {t("intelia:initiatives.list.sections.finished", {
                count: finished.length,
              })}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <div className="mt-3 divide-y divide-border/60">
            {finished.map((initiative) => (
              <button
                key={initiative.id}
                type="button"
                onClick={() => onOpenInitiative(initiative.id)}
                className="w-full cursor-pointer rounded-lg px-2 py-3 text-left transition-colors hover:bg-accent/40"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <strong className="truncate font-semibold text-foreground text-sm">
                    {initiative.name}
                  </strong>
                  <ProgressFigures
                    counters={initiative.counters}
                    className="shrink-0 text-xs"
                  />
                </div>
                <div className="mt-1 text-muted-foreground text-xs">
                  {t("intelia:initiatives.list.sections.finishedRowFoot", {
                    count: initiative.counters.added.total,
                    plan: initiative.counters.plan.total,
                    added: initiative.counters.added.total,
                  })}
                </div>
              </button>
            ))}
          </div>
        </details>
      )}

      {inactive.length > 0 && (
        <details className="group rounded-xl border border-border bg-card/40 p-4 transition-all">
          <summary className="flex cursor-pointer select-none items-center justify-between font-medium text-muted-foreground text-sm hover:text-foreground">
            <span>
              {t("intelia:initiatives.list.sections.inactive", {
                count: inactive.length,
              })}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <div className="mt-3 divide-y divide-border/60">
            {inactive.map((initiative) => (
              <button
                key={initiative.id}
                type="button"
                onClick={() => onOpenInitiative(initiative.id)}
                className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-accent/40"
              >
                <strong className="truncate font-semibold text-foreground text-sm">
                  {initiative.name}
                </strong>
                <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                  {initiative.state === "no_tasks"
                    ? t("intelia:initiatives.list.sections.noTasks")
                    : t("intelia:initiatives.list.sections.allCancelled", {
                        count: initiative.counters.cancelled,
                      })}
                </span>
              </button>
            ))}
          </div>
        </details>
      )}

      {withoutInitiative.length > 0 && (
        <details className="group rounded-xl border border-border bg-card/40 p-4 transition-all">
          <summary className="flex cursor-pointer select-none items-center justify-between font-medium text-muted-foreground text-sm hover:text-foreground">
            <span>
              {t("intelia:initiatives.list.sections.withoutInitiative", {
                count: withoutInitiative.length,
              })}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <div className="mt-3 space-y-2">
            <p className="mb-3 text-muted-foreground text-xs">
              {t("intelia:initiatives.list.sections.withoutInitiativeSubtitle")}
            </p>
            {withoutInitiative.map((task) => {
              const taskNum = formatTaskIdentifier(
                projectSlug,
                task.number,
                task.id,
              );
              const colName = resolveColumnName(columns, task.status);
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onOpenTask(task.id)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/60 p-3 text-left text-xs transition-colors hover:bg-accent/40"
                >
                  <span className="truncate font-medium text-foreground">
                    {taskNum} · {task.title}
                  </span>
                  <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-[11px] text-muted-foreground">
                      {colName}
                    </span>
                    <span>
                      {task.assignee?.name ??
                        t("intelia:initiatives.unassigned")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
