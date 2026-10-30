import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import { DisplaySection } from "@/components/project/display/display-section";
import { ActiveFiltersBar } from "@/components/project/task-filters/active-filters-bar";
import { ProjectToolbar } from "@/components/project/toolbar/project-toolbar";
import { TaskCount } from "@/components/project/toolbar/task-count";
import { useProjectTaskView } from "@/components/project/toolbar/use-project-task-view";
import { LayoutSwitch } from "@/components/project/views/layout-switch";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useGetProjectRelations } from "../api";
import { buildGraphModel } from "../graph-model";
import "../i18n";
import { useBurstValue } from "../realtime";
import { DependenciesView } from "./dependencies-view";
import { LooseTasksToggle } from "./loose-tasks-toggle";

type DependenciesPageProps = {
  workspaceId: string;
  projectId: string;
  taskId?: string;
};

export function DependenciesPage({
  workspaceId,
  projectId,
  taskId,
}: DependenciesPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: liveProject } = useGetTasks(projectId);
  const {
    data: liveRelations,
    isLoading: isRelationsLoading,
    isError: isRelationsError,
    refetch: refetchRelations,
  } = useGetProjectRelations(projectId);
  const [showLoose, setShowLoose] = useState(false);

  // Realtime events patch tasks and refetch relations one by one; lay the
  // graph out once per burst. Filters and toggles still apply at once.
  const live = useMemo(
    () => ({ project: liveProject, relationsData: liveRelations }),
    [liveProject, liveRelations],
  );
  const { project, relationsData } = useBurstValue(
    live,
    (shown) => !!shown.project && !!shown.relationsData,
  );

  const view = useProjectTaskView({
    project,
    projectId,
    workspaceId,
    scope: "schedule",
  });
  const filteredProject = view.filters.filteredProject;

  const allTasks = useMemo(
    () => [
      ...(project?.columns.flatMap((column) => column.tasks) ?? []),
      ...(project?.plannedTasks ?? []),
    ],
    [project],
  );

  const filteredTaskIds = useMemo(() => {
    return new Set([
      ...(filteredProject?.columns.flatMap((col) =>
        col.tasks.map((t) => t.id),
      ) ?? []),
      ...(filteredProject?.plannedTasks ?? []).map((t) => t.id),
    ]);
  }, [filteredProject]);

  const onOpenTask = useCallback(
    (id: string) => {
      navigate({
        to: ".",
        search: { taskId: id },
        replace: true,
      });
    },
    [navigate],
  );

  const graphModel = useMemo(() => {
    return buildGraphModel({
      tasks: allTasks,
      columns: project?.columns ?? [],
      filteredTaskIds,
      relations: relationsData?.relations ?? [],
      externalTasks: relationsData?.externalTasks ?? [],
      showLoose,
      projectSlug: project?.slug ?? "",
      workspaceId,
      onOpenTask,
    });
  }, [
    allTasks,
    project?.columns,
    filteredTaskIds,
    relationsData,
    showLoose,
    project?.slug,
    workspaceId,
    onOpenTask,
  ]);

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="dependencies"
      toolbar={
        <ProjectToolbar
          view={view}
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
          isLoading={isRelationsLoading}
          isError={isRelationsError}
          onRetry={() => void refetchRelations()}
        />

        <TaskDetailsSheet
          taskId={taskId}
          projectId={projectId}
          workspaceId={workspaceId}
          onClose={() =>
            navigate({
              to: ".",
              search: {},
              replace: true,
            })
          }
        />
      </div>
    </ProjectLayout>
  );
}
