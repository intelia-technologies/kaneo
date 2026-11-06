import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, Loader2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Button } from "@/components/ui/button";
import useGetProject from "@/hooks/queries/project/use-get-project";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useIsMobile } from "@/hooks/use-mobile";
import { useProjectInitiatives } from "../api";
import {
  groupInitiatives,
  type InitiativeSort,
  matchesSearch,
  sortInitiatives,
} from "../progress";
import {
  type InitiativesListFilter,
  type InitiativesListSearch,
  rememberListSearch,
} from "../search";
import "./i18n";
import { InitiativeInspector } from "./initiative-inspector";
import { InitiativeListRow } from "./initiative-list-row";
import { InitiativeStatsBar } from "./initiative-stats-bar";
import { InitiativesCollapsedSections } from "./initiatives-collapsed-sections";
import { InitiativesToolbar } from "./initiatives-toolbar";

type InitiativesPageProps = {
  workspaceId: string;
  projectId: string;
  search: InitiativesListSearch;
};

function cleanSearch(input: InitiativesListSearch): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (input.q) result.q = input.q;
  if (input.filter && input.filter !== "all") result.filter = input.filter;
  if (input.sort && input.sort !== "blocked") result.sort = input.sort;
  if (input.selected) result.selected = input.selected;
  if (input.taskId) result.taskId = input.taskId;
  return result;
}

export function InitiativesPage({
  workspaceId,
  projectId,
  search,
}: InitiativesPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const {
    data: projectData,
    isLoading: isProjectLoading,
    isError: isProjectError,
    refetch: refetchInitiatives,
  } = useProjectInitiatives(projectId);

  const { data: projectInfo } = useGetProject({
    id: projectId,
    workspaceId,
  });
  const { data: tasksData } = useGetTasks(projectId);

  const projectSlug = projectInfo?.slug ?? tasksData?.slug ?? null;
  const projectName = projectInfo?.name ?? tasksData?.name ?? "";
  const columns = tasksData?.columns;

  const initiatives = useMemo(
    () => projectData?.initiatives ?? [],
    [projectData?.initiatives],
  );
  const withoutInitiative = useMemo(
    () => projectData?.withoutInitiative ?? [],
    [projectData?.withoutInitiative],
  );

  const groups = useMemo(() => groupInitiatives(initiatives), [initiatives]);

  const updateSearch = useCallback(
    (patch: Partial<InitiativesListSearch>) => {
      navigate({
        to: ".",
        search: () => cleanSearch({ ...search, ...patch }),
        replace: true,
      });
    },
    [navigate, search],
  );

  const handleOpenDetail = useCallback(
    (initiativeId: string, tab: "tasks" | "tree" = "tasks") => {
      rememberListSearch(projectId, { ...search, selected: initiativeId });
      navigate({
        to: "/dashboard/workspace/$workspaceId/project/$projectId/initiatives/$initiativeId",
        params: {
          workspaceId,
          projectId,
          initiativeId,
        },
        search: {
          tab,
        },
      });
    },
    [navigate, workspaceId, projectId, search],
  );

  const handleOpenTask = useCallback(
    (taskId: string) => {
      navigate({
        to: ".",
        search: () => cleanSearch({ ...search, taskId }),
        replace: true,
      });
    },
    [navigate, search],
  );

  const handleCloseTaskSheet = useCallback(() => {
    const { taskId: _omitted, ...rest } = search;
    navigate({
      to: ".",
      search: () => cleanSearch(rest),
      replace: true,
    });
    // The sheet may have changed counters or a block reason.
    void refetchInitiatives();
  }, [navigate, search, refetchInitiatives]);

  const visibleRows = useMemo(() => {
    let rows = groups.inFlight;
    if (search.q) {
      rows = rows.filter((item) => matchesSearch(item.name, search.q!));
    }
    if (search.filter === "blocked") {
      rows = rows.filter((item) => item.counters.blocked > 0);
    } else if (search.filter === "added") {
      rows = rows.filter((item) => item.counters.added.total > 0);
    }
    return sortInitiatives(rows, search.sort ?? "blocked");
  }, [groups.inFlight, search.q, search.filter, search.sort]);

  const selectedInitiative = useMemo(() => {
    if (visibleRows.length === 0) return undefined;
    if (search.selected) {
      const match = visibleRows.find((row) => row.id === search.selected);
      if (match) return match;
    }
    return visibleRows[0];
  }, [visibleRows, search.selected]);

  const handleSelectRow = useCallback(
    (initiativeId: string) => {
      if (isMobile) {
        handleOpenDetail(initiativeId, "tasks");
      } else {
        updateSearch({ selected: initiativeId });
      }
    },
    [isMobile, handleOpenDetail, updateSearch],
  );

  const hasAnyInitiatives =
    initiatives.length > 0 || withoutInitiative.length > 0;

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="initiatives"
    >
      <PageTitle title={`${t("intelia:initiatives.title")} • ${projectName}`} />

      <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-background">
        <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-5 lg:p-8">
          <div className="flex flex-col gap-1">
            <h1 className="font-bold text-2xl text-foreground tracking-tight sm:text-3xl">
              {t("intelia:initiatives.title")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("intelia:initiatives.list.heading.subtitle", {
                inFlight: groups.inFlight.length,
                finished: groups.finished.length,
              })}{" "}
              · {projectName}
            </p>
          </div>

          {isProjectLoading ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card/40 p-8 text-center">
              <Loader2
                aria-hidden="true"
                className="size-6 animate-spin text-muted-foreground"
              />
              <p className="text-muted-foreground text-sm">
                {t("intelia:initiatives.loading")}
              </p>
            </div>
          ) : isProjectError ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
              <AlertCircle
                aria-hidden="true"
                className="size-8 text-destructive"
              />
              <p className="font-medium text-destructive text-sm">
                {t("intelia:initiatives.loadError")}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetchInitiatives()}
              >
                {t("intelia:initiatives.retry")}
              </Button>
            </div>
          ) : !hasAnyInitiatives ? (
            <div className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-border border-dashed p-8 text-center text-muted-foreground text-sm">
              <p>{t("intelia:initiatives.list.emptyProject")}</p>
            </div>
          ) : (
            <>
              <InitiativeStatsBar initiatives={initiatives} />

              <InitiativesToolbar
                query={search.q ?? ""}
                onQueryChange={(q) => updateSearch({ q })}
                filter={search.filter ?? "all"}
                onFilterChange={(filter: InitiativesListFilter) =>
                  updateSearch({ filter })
                }
                sort={search.sort ?? "blocked"}
                onSortChange={(sort: InitiativeSort) => updateSearch({ sort })}
              />

              <div
                className={
                  !isMobile && selectedInitiative
                    ? "grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(240px,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] xl:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]"
                    : "space-y-4"
                }
              >
                <section className="min-w-0 space-y-3">
                  <div className="flex items-center justify-between font-medium text-muted-foreground text-xs">
                    <span>
                      {t("intelia:initiatives.list.heading.visibleCount", {
                        count: visibleRows.length,
                      })}
                    </span>
                    <span>
                      {t("intelia:initiatives.list.heading.doneOfActive")}
                    </span>
                  </div>

                  {visibleRows.length === 0 ? (
                    <div className="rounded-xl border border-border border-dashed bg-card/30 p-8 text-center text-muted-foreground text-sm">
                      {groups.inFlight.length === 0
                        ? t("intelia:initiatives.list.emptyInFlight")
                        : t("intelia:initiatives.list.emptyFiltered")}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {visibleRows.map((initiative) => (
                        <InitiativeListRow
                          key={initiative.id}
                          initiative={initiative}
                          isSelected={
                            !isMobile &&
                            selectedInitiative?.id === initiative.id
                          }
                          onSelect={() => handleSelectRow(initiative.id)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {!isMobile && selectedInitiative && (
                  <InitiativeInspector
                    initiative={selectedInitiative}
                    projectSlug={projectSlug}
                    onOpenTask={handleOpenTask}
                    onViewDetail={(tab) =>
                      handleOpenDetail(selectedInitiative.id, tab)
                    }
                  />
                )}
              </div>

              <InitiativesCollapsedSections
                finished={groups.finished}
                inactive={groups.inactive}
                withoutInitiative={withoutInitiative}
                projectSlug={projectSlug}
                columns={columns}
                onOpenInitiative={(id) => handleOpenDetail(id, "tasks")}
                onOpenTask={handleOpenTask}
              />
            </>
          )}
        </div>

        <TaskDetailsSheet
          taskId={search.taskId}
          projectId={projectId}
          workspaceId={workspaceId}
          onClose={handleCloseTaskSheet}
        />
      </div>
    </ProjectLayout>
  );
}
