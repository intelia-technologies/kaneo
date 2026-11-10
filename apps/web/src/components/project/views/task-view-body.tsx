import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import KanbanBoard from "@/components/kanban-board";
import ListView from "@/components/list-view";
import { BoardLoadError } from "@/components/project/board-load-error";
import { BoardRefreshError } from "@/components/project/board-refresh-error";
import type { ProjectTaskView } from "@/components/project/toolbar/use-project-task-view";
import { cn } from "@/lib/cn";
import { type SortConfig, sortTasks } from "@/lib/sort-tasks";
import { useBackgroundStore } from "@/store/background";
import { BoardSkeleton } from "./board-skeleton";
import { TaskViewReadOnlyContext } from "./task-view-read-only";

type TaskViewBodyProps = {
  view: Pick<ProjectTaskView, "descriptionSearch" | "filters">;
  layout: "board" | "list";
  sort: SortConfig;
  onSortChange: (sort: SortConfig) => void;
  /** State of the project's task query. */
  isError: boolean;
  isFetching: boolean;
  isLoaded: boolean;
  onRetry: () => void;
  /** No dragging, no multiple selection and no column actions. */
  readOnly?: boolean;
  /** Where the list keeps its collapsed sections, if not the project's. */
  viewKey?: string;
  /** List sections collapsed until the viewer opens them. */
  defaultCollapsed?: string[];
};

// The project's tasks, filtered by the view, as kanban or grouped list: the
// project's board and the initiative's «Tareas» tab (design 19 annex §2).
export function TaskViewBody({
  view,
  layout,
  sort,
  onSortChange,
  isError,
  isFetching,
  isLoaded,
  onRetry,
  readOnly = false,
  viewKey,
  defaultCollapsed,
}: TaskViewBodyProps) {
  const { t } = useTranslation();
  const { background } = useBackgroundStore();
  const { descriptionSearch, filters } = view;

  const sortedProject = useMemo(() => {
    const filteredProject = filters.filteredProject;
    if (!filteredProject || sort.field === "position") return filteredProject;
    return {
      ...filteredProject,
      columns: filteredProject.columns.map((column) => ({
        ...column,
        tasks: sortTasks(column.tasks, sort),
      })),
    };
  }, [filters.filteredProject, sort]);

  return (
    <TaskViewReadOnlyContext.Provider value={readOnly}>
      {descriptionSearch.isLoading && (
        <p role="status" className="px-4 py-2 text-sm text-muted-foreground">
          {t("tasks:descriptionSearchLoading")}
        </p>
      )}
      {descriptionSearch.isError && (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {t("tasks:descriptionSearchError")}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void descriptionSearch.retry()}
          >
            {t("tasks:descriptionRetry")}
          </button>
        </p>
      )}

      {isError && sortedProject ? (
        <BoardRefreshError isRetrying={isFetching} onRetry={onRetry} />
      ) : null}
      <div
        className={cn("flex h-full flex-1 overflow-hidden", {
          "bg-background": !background,
        })}
      >
        {sortedProject ? (
          layout === "board" ? (
            <KanbanBoard
              key={sortedProject.id}
              project={sortedProject}
              disableCollectionActions={readOnly || isFetching || isError}
              disableDragDrop={
                readOnly ||
                (isFetching && !isLoaded) ||
                isError ||
                (sort.field !== "position" &&
                  sort.field !== "number" &&
                  sort.field !== "priority")
              }
              sortedByNumber={sort.field === "number"}
              sortedByPriority={sort.field === "priority"}
            />
          ) : (
            <ListView
              key={sortedProject.id}
              project={sortedProject}
              viewKey={viewKey}
              defaultCollapsed={defaultCollapsed}
              disableCollectionActions={readOnly || isFetching || isError}
              disableDragDrop={
                readOnly || isFetching || isError || sort.field !== "position"
              }
              sort={sort}
              onSortChange={onSortChange}
            />
          )
        ) : isError ? (
          <BoardLoadError isRetrying={isFetching} onRetry={onRetry} />
        ) : (
          <BoardSkeleton />
        )}
      </div>
    </TaskViewReadOnlyContext.Provider>
  );
}
