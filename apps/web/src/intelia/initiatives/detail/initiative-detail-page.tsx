import { useNavigate } from "@tanstack/react-router";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useInitiative, useInitiativePlan } from "../api";
import type { InitiativeDetailSearch, InitiativeTab } from "../search";
import { DetailHeader } from "./detail-header";
import "./i18n";
import { InitiativeHistoryCollapsible } from "./initiative-history-collapsible";
import { PlanTab } from "./plan-tab";
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

  const { data: liveProjectTasks } = useGetTasks(projectId);
  const { data: columns } = useGetColumns(projectId);

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
  const {
    data: plan,
    isLoading: isPlanLoading,
    isError: isPlanError,
    refetch: refetchPlan,
  } = useInitiativePlan(projectId, initiativeId, activeTab === "plan");

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
    // The sheet may have changed what the table shows (status, assignee,
    // block reason) without a socket event reaching here yet.
    void refetchInitiative();
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

            <InitiativeHistoryCollapsible initiativeId={initiativeId} />

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
                <TabsTab value="plan">
                  {t("intelia:initiatives.detail.tabs.plan")}
                </TabsTab>
              </TabsList>

              <TabsPanel value="tasks">
                <TasksTab
                  initiative={initiative}
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

              <TabsPanel value="plan">
                {isPlanLoading ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    {t("intelia:initiatives.loading")}
                  </div>
                ) : isPlanError || !plan ? (
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
                      onClick={() => void refetchPlan()}
                    >
                      {t("intelia:initiatives.retry")}
                    </Button>
                  </div>
                ) : (
                  <PlanTab
                    plan={plan}
                    initiative={initiative}
                    columns={columns}
                  />
                )}
              </TabsPanel>
            </Tabs>
          </div>
        )}

        <TaskDetailsSheet
          taskId={search.taskId}
          // The task may be of another project of the initiative (design 52).
          projectId={
            initiative?.tasks.find((task) => task.id === search.taskId)
              ?.projectId ?? projectId
          }
          workspaceId={workspaceId}
          onClose={handleCloseTaskSheet}
        />
      </div>
    </ProjectLayout>
  );
}
