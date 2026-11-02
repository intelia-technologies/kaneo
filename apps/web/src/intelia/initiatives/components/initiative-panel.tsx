import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "@/components/task/sections/section-header";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  useClosePlan,
  useInitiativeHistory,
  useInitiativeOptions,
  useSetTaskInitiative,
  useTaskInitiative,
  useTaskInitiativeHistory,
} from "../api";
import { InitiativePicker } from "./initiative-picker";
import "../i18n";

type CombinedHistoryItem = {
  id: string;
  date: string;
  description: string;
  author: string;
  source: string;
};

function resolveAuthor(
  name: string | null,
  actor: string | null,
  source: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (name) return name;
  if (actor) return actor;
  return t(`intelia:initiative.source.${source}`);
}

export function TaskInitiativePanel({
  taskId,
}: {
  taskId: string | undefined;
}) {
  const { t } = useTranslation();
  const { data: task } = useGetTask(taskId ?? "");
  const projectId = task?.projectId;

  const { data: saved, isError } = useTaskInitiative(taskId);
  const { data: taskHistory = [] } = useTaskInitiativeHistory(taskId);
  const { data: options = [] } = useInitiativeOptions(projectId);
  const currentInitiativeId = saved?.initiativeId;
  const { data: initiativeHistory = [] } =
    useInitiativeHistory(currentInitiativeId);

  const setInitiative = useSetTaskInitiative();
  const closePlan = useClosePlan();

  const [pendingInitiativeId, setPendingInitiativeId] = useState<string | null>(
    null,
  );
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  useEffect(() => {
    setPendingInitiativeId(null);
  }, [saved?.initiativeId, saved?.since]);

  const sourceLabel = (source: string) =>
    t(`intelia:initiative.source.${source}`);

  const currentOption = options.find((opt) => opt.id === currentInitiativeId);
  const planClosedAt = currentOption?.planClosedAt;
  const isPlanClosed = Boolean(planClosedAt);

  const who = (name: string | null, actor: string | null, source: string) =>
    resolveAuthor(name, actor, source, t);
  const handleChangeInitiative = (nextInitiativeId: string) => {
    if (!taskId || nextInitiativeId === saved?.initiativeId) return;
    const previousId = saved?.initiativeId ?? null;
    setPendingInitiativeId(nextInitiativeId);

    setInitiative.mutate(
      { taskId, initiativeId: nextInitiativeId },
      {
        onSuccess: () => {
          setPendingInitiativeId(null);
        },
        onError: (error) => {
          setPendingInitiativeId(previousId);
          toast.error(
            error instanceof Error && error.message
              ? error.message
              : t("intelia:initiative.saveError"),
          );
        },
      },
    );
  };

  const handleConfirmClosePlan = () => {
    if (!currentInitiativeId) return;
    closePlan.mutate(
      { initiativeId: currentInitiativeId },
      {
        onSuccess: () => {
          setConfirmCloseOpen(false);
        },
        onError: (error) => {
          toast.error(
            error instanceof Error && error.message
              ? error.message
              : t("intelia:initiative.closePlanError"),
          );
        },
      },
    );
  };

  // A handful of rows: computed on each render, no memo needed.
  const taskEntries: CombinedHistoryItem[] = taskHistory.map((entry) => {
    const prevName =
      options.find((o) => o.id === entry.previousInitiativeId)?.name ??
      entry.previousInitiativeId;
    const currentName =
      options.find((o) => o.id === entry.initiativeId)?.name ??
      (entry.initiativeId === saved?.initiativeId
        ? saved.initiativeName
        : entry.initiativeId);
    const originLabel = entry.origin
      ? t(`intelia:initiative.origins.${entry.origin}`)
      : "";

    let description = "";
    if (!entry.previousInitiativeId && entry.initiativeId) {
      description = t("intelia:initiative.firstSet", {
        to: originLabel ? `${currentName} (${originLabel})` : currentName,
      });
    } else if (entry.previousInitiativeId && !entry.initiativeId) {
      description = t("intelia:initiative.removed", {
        from: prevName,
      });
    } else {
      description = t("intelia:initiative.change", {
        from: prevName,
        to: originLabel ? `${currentName} (${originLabel})` : currentName,
      });
    }

    return {
      id: entry.id,
      date: entry.changedAt,
      description,
      author: who(entry.changedByName, entry.changedByActor, entry.source),
      source: entry.source,
    };
  });

  const initiativeEntries: CombinedHistoryItem[] = initiativeHistory
    .filter((entry) => entry.kind === "created" || entry.kind === "plan_closed")
    .map((entry) => {
      let description = "";
      if (entry.kind === "created") {
        description = t("intelia:initiative.eventCreated");
      } else if (entry.kind === "plan_closed") {
        description =
          entry.source === "auto"
            ? t("intelia:initiative.eventPlanClosedAuto")
            : t("intelia:initiative.eventPlanClosed");
      }
      const author = who(
        entry.changedByName,
        entry.changedByActor,
        entry.source,
      );

      return {
        id: entry.id,
        date: entry.changedAt,
        description,
        author,
        source: entry.source,
      };
    });

  const combinedHistory = [...taskEntries, ...initiativeEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const selectedInitiativeId =
    pendingInitiativeId !== null
      ? pendingInitiativeId
      : (saved?.initiativeId ?? null);

  if (!taskId) return null;

  return (
    <section className="flex flex-col gap-1">
      <SectionHeader title={t("intelia:initiative.title")} />
      <div className="flex flex-col gap-2 px-2 py-1">
        {isError && (
          <p role="alert" className="text-destructive text-xs">
            {t("intelia:initiative.loadError")}
          </p>
        )}

        {saved ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {saved.initiativeName}
              </span>
              <Badge
                variant={saved.origin === "plan" ? "secondary" : "outline"}
                data-initiative-origin={saved.origin}
              >
                {t(`intelia:initiative.origins.${saved.origin}`)}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {t("intelia:initiative.setBy", {
                  name: who(saved.setByName, saved.setByActor, saved.source),
                  date: formatDateTime(saved.since),
                })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isPlanClosed ? (
                <span className="text-muted-foreground text-xs">
                  {t("intelia:initiative.planClosedOn", {
                    date: formatDateTime(planClosedAt!),
                  })}
                </span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={closePlan.isPending}
                  onClick={() => setConfirmCloseOpen(true)}
                  className="h-7 text-xs"
                >
                  {t("intelia:initiative.closePlan")}
                </Button>
              )}
            </div>
          </div>
        ) : (
          !isError && (
            <p className="text-muted-foreground text-xs">
              {t("intelia:initiative.noInitiative")}
            </p>
          )
        )}

        <div className="mt-1">
          <InitiativePicker
            projectId={projectId}
            value={selectedInitiativeId}
            onChange={handleChangeInitiative}
            disabled={setInitiative.isPending}
          />
        </div>

        <div className="flex flex-col gap-1 mt-1">
          <span className="text-muted-foreground text-xs">
            {t("intelia:initiative.history")}
          </span>
          {combinedHistory.length === 0 ? (
            <span className="text-muted-foreground/70 text-xs">
              {t("intelia:initiative.noHistory")}
            </span>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {combinedHistory.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-baseline gap-x-2 text-xs"
                >
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {formatDateTime(entry.date)}
                  </span>
                  <span className="text-foreground/85">
                    {entry.description}
                  </span>
                  <span className="text-muted-foreground/70">
                    {entry.author}
                    {entry.source !== "session" &&
                      entry.author !== sourceLabel(entry.source) &&
                      ` · ${sourceLabel(entry.source)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("intelia:initiative.closePlanConfirm.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("intelia:initiative.closePlanConfirm.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="sm" />}>
              {t("intelia:initiative.closePlanConfirm.cancel")}
            </AlertDialogClose>
            <Button
              type="button"
              disabled={closePlan.isPending}
              onClick={handleConfirmClosePlan}
            >
              {t("intelia:initiative.closePlanConfirm.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
