import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import { DisplaySection } from "@/components/project/display/display-section";
import { TaskDisplayOptions } from "@/components/project/display/task-display-options";
import { ActiveFiltersBar } from "@/components/project/task-filters/active-filters-bar";
import { ProjectToolbar } from "@/components/project/toolbar/project-toolbar";
import { TaskCount } from "@/components/project/toolbar/task-count";
import { useProjectTaskView } from "@/components/project/toolbar/use-project-task-view";
import { LayoutSwitch } from "@/components/project/views/layout-switch";
import { TaskViewBody } from "@/components/project/views/task-view-body";
import CreateTaskModal from "@/components/shared/modals/create-task-modal";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { ProjectPrioritiesPanel } from "@/intelia/priorities/components/project-priorities-panel";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useBoardSort } from "@/hooks/use-board-sort";
import { countColumnTasks } from "@/lib/task-filters/count-tasks";
import useProjectStore from "@/store/project";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type { ProjectWithTasks } from "@/types/project";

type BoardSearchParams = {
  taskId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/board",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): BoardSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const {
    data,
    isError: boardError,
    isFetching: boardFetching,
    isSuccess: boardLoaded,
    refetch: retryBoard,
  } = useGetTasks(projectId);
  const { project: storedProject, setProject } = useProjectStore();
  const project: ProjectWithTasks | undefined =
    storedProject?.id === projectId ? storedProject : data;
  const viewMode = useUserPreferencesStore((state) => state.viewMode);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const { sort, setSort } = useBoardSort(projectId);
  const view = useProjectTaskView({
    project,
    projectId,
    workspaceId,
    scope: "board",
  });
  const { filters } = view;

  const handleCloseTaskSheet = useCallback(() => {
    navigate({
      to: ".",
      search: {},
      replace: true,
    });
  }, [navigate]);

  useEffect(() => {
    if (data) {
      setProject(data);
    }
  }, [data, setProject]);

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="board"
      toolbar={
        <ProjectToolbar
          view={view}
          display={
            <>
              <DisplaySection>
                <LayoutSwitch
                  workspaceId={workspaceId}
                  projectId={projectId}
                  currentRoute="board"
                  currentView={viewMode}
                />
              </DisplaySection>
              <TaskDisplayOptions
                projectId={projectId}
                sort={sort}
                onSortChange={setSort}
                layout={viewMode === "board" ? "cards" : "rows"}
                showBackgroundSwitch={
                  viewMode === "board" && !!project?.backgroundVersion
                }
              />
            </>
          }
        />
      }
      summary={
        <TaskCount
          shown={countColumnTasks(filters.filteredProject)}
          total={countColumnTasks(project)}
        />
      }
      filterBar={
        <ActiveFiltersBar
          subjects={view.subjects}
          onClear={filters.clearFilters}
          customFieldValues={filters.customFieldValues}
        />
      }
    >
      <PageTitle
        title={
          project
            ? `${project.name} / ${viewMode === "board" ? t("tasks:view.board") : t("tasks:view.list")}`
            : undefined
        }
      />
      <div className="relative flex flex-col h-full min-h-0 overflow-hidden">
        <ProjectPrioritiesPanel
          projectId={projectId}
          workspaceId={workspaceId}
        />

        <TaskViewBody
          view={view}
          layout={viewMode}
          sort={sort}
          onSortChange={setSort}
          isError={boardError}
          isFetching={boardFetching}
          isLoaded={boardLoaded}
          onRetry={() => void retryBoard()}
        />

        <CreateTaskModal
          open={isTaskModalOpen}
          projectId={projectId}
          onClose={() => setIsTaskModalOpen(false)}
        />

        <TaskDetailsSheet
          taskId={taskId}
          projectId={projectId}
          workspaceId={workspaceId}
          onClose={handleCloseTaskSheet}
        />
      </div>
    </ProjectLayout>
  );
}
