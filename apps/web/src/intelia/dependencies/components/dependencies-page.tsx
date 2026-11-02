import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import { DisplaySection } from "@/components/project/display/display-section";
import { ActiveFiltersBar } from "@/components/project/task-filters/active-filters-bar";
import { ProjectToolbar } from "@/components/project/toolbar/project-toolbar";
import { TaskCount } from "@/components/project/toolbar/task-count";
import { LayoutSwitch } from "@/components/project/views/layout-switch";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sortInitiatives } from "@/intelia/initiatives/progress";
import "../i18n";
import { useDependenciesGraph } from "../use-dependencies-graph";
import { DependenciesView } from "./dependencies-view";
import { LooseTasksToggle } from "./loose-tasks-toggle";
import { ShowCancelledToggle } from "./show-cancelled-toggle";
type DependenciesPageProps = {
  workspaceId: string;
  projectId: string;
  taskId?: string;
  initiativeId?: string;
};

export function DependenciesPage({
  workspaceId,
  projectId,
  taskId,
  initiativeId,
}: DependenciesPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [showLoose, setShowLoose] = useState(false);
  const [showCancelledOverride, setShowCancelledOverride] = useState<
    boolean | null
  >(null);
  const showCancelled = showCancelledOverride ?? (initiativeId ? false : true);
  const onOpenTask = useCallback(
    (id: string) => {
      navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({ ...prev, taskId: id }),
        replace: true,
      });
    },
    [navigate],
  );

  const {
    project,
    view,
    graphModel,
    projectInitiatives,
    isLoading,
    isError,
    refetch,
  } = useDependenciesGraph({
    projectId,
    workspaceId,
    initiativeId,
    showLoose,
    showCancelled,
    onOpenTask,
  });

  const sortedInitiatives = useMemo(
    () => sortInitiatives(projectInitiatives, "name"),
    [projectInitiatives],
  );

  const selectedInitiativeName = useMemo(() => {
    if (!initiativeId) return t("intelia:dependencies.allInitiatives");
    const found = sortedInitiatives.find((i) => i.id === initiativeId);
    return found?.name ?? t("intelia:dependencies.allInitiatives");
  }, [initiativeId, sortedInitiatives, t]);

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="dependencies"
      toolbar={
        <ProjectToolbar
          view={view}
          actions={
            <div className="flex items-center gap-1.5">
              <span
                id="initiative-select-label"
                className="hidden text-xs font-medium text-muted-foreground sm:inline"
              >
                {t("intelia:dependencies.initiative")}:
              </span>
              <Select
                value={initiativeId ?? "all"}
                onValueChange={(val) => {
                  navigate({
                    to: ".",
                    search: (prev: Record<string, unknown>) => ({
                      ...prev,
                      initiativeId: val === "all" ? undefined : val,
                    }),
                    replace: true,
                  });
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="h-8 w-36 text-xs sm:w-44"
                  aria-label={t("intelia:dependencies.initiative")}
                  aria-labelledby="initiative-select-label"
                >
                  <SelectValue>{selectedInitiativeName}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("intelia:dependencies.allInitiatives")}
                  </SelectItem>
                  {sortedInitiatives.map((init) => (
                    <SelectItem key={init.id} value={init.id}>
                      {init.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
          display={
            <>
              <DisplaySection>
                <LayoutSwitch
                  workspaceId={workspaceId}
                  projectId={projectId}
                  currentRoute="dependencies"
                  currentView="dependencies"
                />
              </DisplaySection>
              <DisplaySection>
                <LooseTasksToggle
                  showLoose={showLoose}
                  onCheckedChange={setShowLoose}
                />
              </DisplaySection>
              <DisplaySection>
                <ShowCancelledToggle
                  showCancelled={showCancelled}
                  onCheckedChange={(val) => setShowCancelledOverride(val)}
                />
              </DisplaySection>
            </>
          }
        />
      }
      summary={
        <TaskCount
          shown={graphModel.visibleProjectTasks}
          total={graphModel.totalProjectTasks}
        />
      }
      filterBar={
        <ActiveFiltersBar
          subjects={view.subjects}
          onClear={view.filters.clearFilters}
          customFieldValues={view.filters.customFieldValues}
        />
      }
    >
      <PageTitle
        title={`${t("intelia:dependencies.title")} • ${project?.name ?? ""}`}
        hideAppName
      />
      <div className="flex h-full min-h-0 flex-col bg-background">
        <DependenciesView
          model={graphModel}
          showLoose={showLoose}
          onToggleShowLoose={() => setShowLoose(true)}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
        />

        <TaskDetailsSheet
          taskId={taskId}
          projectId={projectId}
          workspaceId={workspaceId}
          onClose={() =>
            navigate({
              to: ".",
              search: (prev: Record<string, unknown>) => {
                const next = { ...prev };
                delete next.taskId;
                return next;
              },
              replace: true,
            })
          }
        />
      </div>
    </ProjectLayout>
  );
}
