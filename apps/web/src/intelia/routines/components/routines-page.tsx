import { useNavigate } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useSaveRoutine, useWorkspaceRoutines } from "../api";
import "../i18n";
import { describeSchedule } from "../schedule";
import { RunResult } from "./run-result";

export function RoutinesPage({ workspaceId }: { workspaceId: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const {
    data: routines,
    isLoading,
    isError,
  } = useWorkspaceRoutines(workspaceId);
  const save = useSaveRoutine();
  const title = t("intelia:routines.title");

  return (
    <>
      <PageTitle title={title} />
      <WorkspaceLayout title={title}>
        <div className="h-full overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col px-4">
              {[1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="flex h-11 items-center gap-3 border-border/50 border-b px-1"
                >
                  <Skeleton className="h-3.5 w-14" />
                  <Skeleton className="h-3.5 flex-1" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <p role="alert" className="p-6 text-muted-foreground text-sm">
              {t("intelia:routines.page.loadError")}
            </p>
          ) : !routines?.length ? (
            <Empty className="min-h-[60vh]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarClock />
                </EmptyMedia>
                <EmptyTitle>{t("intelia:routines.page.empty")}</EmptyTitle>
                <EmptyDescription>
                  {t("intelia:routines.page.emptyDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3 p-4">
              <p className="text-muted-foreground text-sm">
                {t("intelia:routines.page.description")}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("intelia:routines.page.task")}</TableHead>
                    <TableHead>{t("intelia:routines.page.project")}</TableHead>
                    <TableHead>{t("intelia:routines.page.assignee")}</TableHead>
                    <TableHead>{t("intelia:routines.page.when")}</TableHead>
                    <TableHead>{t("intelia:routines.page.next")}</TableHead>
                    <TableHead>{t("intelia:routines.page.last")}</TableHead>
                    <TableHead>{t("intelia:routines.page.owner")}</TableHead>
                    <TableHead>{t("intelia:routines.page.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routines.map((routine) => {
                    const { task } = routine;
                    const reference = `${task.projectSlug}-${task.number ?? ""}`;
                    const open = () =>
                      navigate({
                        to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
                        params: {
                          workspaceId,
                          projectId: task.projectId,
                          taskId: task.id,
                        },
                      });
                    return (
                      <TableRow
                        key={routine.id}
                        className="cursor-pointer"
                        onClick={open}
                      >
                        <TableCell className="max-w-80">
                          <button
                            type="button"
                            className="flex min-w-0 items-center gap-2 text-left outline-none focus-visible:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              open();
                            }}
                          >
                            <span className="shrink-0 font-mono text-muted-foreground text-xs">
                              {reference}
                            </span>
                            <span className="truncate">{task.title}</span>
                          </button>
                        </TableCell>
                        <TableCell>{task.projectName}</TableCell>
                        <TableCell>
                          {task.assigneeName ?? (
                            <span className="text-muted-foreground">
                              {t("intelia:routines.page.unassigned")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell
                          title={`${routine.cron} (${routine.timezone})`}
                        >
                          {describeSchedule(t, routine.cron, i18n.language)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {routine.active
                            ? formatDateTime(routine.nextRunAt)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {routine.lastRunAt ? (
                            <span className="flex items-center gap-2 text-xs">
                              <span className="tabular-nums">
                                {formatDateTime(routine.lastRunAt)}
                              </span>
                              {routine.lastResult && (
                                <RunResult result={routine.lastResult} />
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {t("intelia:routines.page.never")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{routine.ownerName ?? "—"}</TableCell>
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <Switch
                            checked={routine.active}
                            disabled={save.isPending}
                            aria-label={t(
                              routine.active
                                ? "intelia:routines.page.pause"
                                : "intelia:routines.page.activate",
                              { task: reference },
                            )}
                            onCheckedChange={(active) =>
                              save.mutate(
                                {
                                  taskId: task.id,
                                  input: {
                                    cron: routine.cron,
                                    timezone: routine.timezone,
                                    active,
                                  },
                                },
                                {
                                  onError: (error) =>
                                    toast.error(
                                      error instanceof Error && error.message
                                        ? error.message
                                        : t("intelia:routines.panel.saveError"),
                                    ),
                                },
                              )
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </WorkspaceLayout>
    </>
  );
}
