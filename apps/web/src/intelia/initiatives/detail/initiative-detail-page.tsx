import { useNavigate } from "@tanstack/react-router";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import useGetProject from "@/hooks/queries/project/use-get-project";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useInitiative } from "../api";
import type { InitiativeDetailSearch, InitiativeTab } from "../search";
import { DetailHeader } from "./detail-header";
import "./i18n";
import { InitiativeHistoryCollapsible } from "./initiative-history-collapsible";
import { TasksTab } from "./tasks-tab";
import { TreeTab } from "./tree-tab";

type InitiativeDetailPageProps = {
  workspaceId: string;
  projectId: string;
  initiativeId: string;
  search: InitiativeDetailSearch;
};

export function InitiativeDetailPage({
  workspaceId,
  projectId,
  initiativeId,
  search,
}: InitiativeDetailPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lastFocusedTaskIdRef = useRef<string | null>(null);

  const {
    data: initiative,
    isLoading: isInitiativeLoading,
    isError: isInitiativeError,
    refetch: refetchInitiative,
  } = useInitiative(projectId, initiativeId);

  const { data: project } = useGetProject({
    id: projectId,
    workspaceId,
  });

  const { data: liveProjectTasks } = useGetTasks(projectId);

  const projectSlug = project?.slug ?? "";

  const projectColumnsMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (liveProjectTasks?.columns) {
      for (const col of liveProjectTasks.columns) {
        if (col.slug) map[col.slug] = col.name;
        map[col.id] = col.name;
      }
    }
    return map;
  }, [liveProjectTasks?.columns]);

  const activeTab: InitiativeTab = search.tab ?? "tasks";

  const updateSearch = (next: Partial<InitiativeDetailSearch>) => {
    const merged: Record<string, unknown> = { ...search, ...next };
    if (merged.tab === "tasks") delete merged.tab;
    if (merged.q === "") delete merged.q;
    if (merged.origin === "all") delete merged.origin;
    if (merged.status === "all") delete merged.status;
    if (merged.assignee === "all") delete merged.assignee;
    if (!merged.cancelled) delete merged.cancelled;
    if (!merged.taskId) delete merged.taskId;

    navigate({
      to: ".",
      search: merged,
      replace: true,
    });
  };

  const handleTabChange = (value: string) => {
    const nextTab = value === "tasks" ? undefined : (value as InitiativeTab);
    updateSearch({ tab: nextTab });
  };

  const handleFilterChange = (filters: Partial<InitiativeDetailSearch>) => {
    updateSearch(filters);
  };

  const handleOpenTask = (taskId: string) => {
    lastFocusedTaskIdRef.current = taskId;
    updateSearch({ taskId });
  };

  const handleCloseTaskSheet = () => {
    const targetId = lastFocusedTaskIdRef.current;
    const nextSearch: Record<string, unknown> = { ...search };
    delete nextSearch.taskId;
    navigate({
      to: ".",
      search: nextSearch,
      replace: true,
    });
    if (targetId) {
      requestAnimationFrame(() => {
        const btn = document.getElementById(`task-btn-${targetId}`);
        btn?.focus();
      });
    }
  };

  const handleShowCancelledChange = (cancelled: boolean) => {
    updateSearch({ cancelled: cancelled ? true : undefined });
  };

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="initiatives"
    >
      <PageTitle
        title={
          initiative
            ? `${initiative.name} • ${t("intelia:initiatives.title")}`
            : t("intelia:initiatives.title")
        }
        hideAppName
      />

      <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-background p-6">
        {isInitiativeLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            {t("intelia:initiatives.loading")}
          </div>
        ) : isInitiativeError || !initiative ? (
          <div
            role="alert"
            className="flex h-64 flex-col items-center justify-center gap-3 text-center"
          >
            <p className="text-sm text-muted-foreground">
              {t("intelia:initiatives.loadError")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetchInitiative()}
            >
              {t("intelia:initiatives.retry")}
            </Button>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <DetailHeader
              workspaceId={workspaceId}
              projectId={projectId}
              initiative={initiative}
            />

            <InitiativeHistoryCollapsible
              projectId={projectId}
              initiativeId={initiativeId}
            />

            <Tabs
              value={activeTab}
              onValueChange={handleTabChange}
              className="w-full"
            >
              <TabsList variant="underline" className="border-b border-border">
                <TabsTab value="tasks">
                  {t("intelia:initiatives.detail.tabs.tasks")}
                </TabsTab>
                <TabsTab value="tree">
                  {t("intelia:initiatives.detail.tabs.tree")}
                </TabsTab>
              </TabsList>

              <TabsPanel value="tasks">
                <TasksTab
                  initiative={initiative}
                  projectSlug={projectSlug}
                  projectColumnsMap={projectColumnsMap}
                  search={search}
                  onFilterChange={handleFilterChange}
                  onOpenTask={handleOpenTask}
                />
              </TabsPanel>

              <TabsPanel value="tree">
                <TreeTab
                  projectId={projectId}
                  workspaceId={workspaceId}
                  initiativeId={initiativeId}
                  initiative={initiative}
                  search={search}
                  onShowCancelledChange={handleShowCancelledChange}
                  onOpenTask={handleOpenTask}
                />
              </TabsPanel>
            </Tabs>
          </div>
        )}

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
