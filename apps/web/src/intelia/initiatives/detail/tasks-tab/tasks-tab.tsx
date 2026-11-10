import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TaskDisplayOptions } from "@/components/project/display/task-display-options";
import { ActiveFiltersBar } from "@/components/project/task-filters/active-filters-bar";
import { ProjectToolbar } from "@/components/project/toolbar/project-toolbar";
import { TaskCount } from "@/components/project/toolbar/task-count";
import { useProjectTaskView } from "@/components/project/toolbar/use-project-task-view";
import { TaskViewBody } from "@/components/project/views/task-view-body";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useBoardSort } from "@/hooks/use-board-sort";
import { useStoredState } from "@/hooks/use-stored-state";
import { countColumnTasks } from "@/lib/task-filters/count-tasks";
import useProjectStore from "@/store/project";
import type { InitiativeDetail } from "../../api";
import {
  GrowthLine,
  HiddenTasksLine,
  ScopeBreakdown,
} from "../../components/initiative-progress";
import { TaskOriginsContext } from "../../origin/origin-context";
import { scopeInitiativeTasks } from "./scope-initiative-tasks";
import { type TasksLayout, TasksLayoutSwitch } from "./tasks-layout-switch";

type TasksTabProps = {
  initiative: InitiativeDetail;
  projectId: string;
  workspaceId: string;
};

// Cancelled tasks keep their column, folded until the viewer opens it.
const CANCELLED_COLLAPSED = ["cancelled", "canceled"];

const parseLayout = (raw: unknown): TasksLayout =>
  raw === "board" ? "board" : "list";

// Design 19 annex §2: the project's task view, only with the initiative's
// tasks and read-only. Filters, order, layout and folded sections have their
// own keys, so they never change the project's board.
export function TasksTab({
  initiative,
  projectId,
  workspaceId,
}: TasksTabProps) {
  const { t } = useTranslation();
  const viewKey = `initiative:${initiative.id}`;
  const { data, hasAllPages, isError, isFetching, refetch } =
    useGetTasks(projectId);
  // A partial board would show the initiative half-loaded, with a count
  // unlike the boxes above (design 19 annex §3).
  const board = hasAllPages ? data : undefined;
  const setProject = useProjectStore((state) => state.setProject);

  // Cards and rows read the project (slug, columns) from the store, as on the
  // board; it gets the whole project, never the initiative's slice.
  useEffect(() => {
    if (board) setProject(board);
  }, [board, setProject]);

  const origins = useMemo(
    () => new Map(initiative.tasks.map((task) => [task.id, task.origin])),
    [initiative.tasks],
  );
  const scoped = useMemo(
    () => (board ? scopeInitiativeTasks(board, origins) : undefined),
    [board, origins],
  );
  const view = useProjectTaskView({
    project: scoped?.project,
    projectId,
    workspaceId,
    scope: "board",
    filterKey: viewKey,
    origins,
  });
  const { sort, setSort } = useBoardSort(viewKey);
  const [layout, setLayout] = useStoredState(
    `kaneo:initiative-layout:${initiative.id}`,
    parseLayout,
    "list",
  );

  const summary = (
    <>
      <ScopeBreakdown counters={initiative.counters} />
      <GrowthLine counters={initiative.counters} />
      <HiddenTasksLine counters={initiative.counters} />
    </>
  );

  if (initiative.tasks.length === 0) {
    return (
      <div className="space-y-6 pt-2">
        {summary}
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <h3 className="text-base font-semibold text-foreground">
            {t("intelia:initiatives.detail.noTasksTitle")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("intelia:initiatives.detail.noTasksDescription")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      {summary}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <TasksLayoutSwitch value={layout} onChange={setLayout} />
          <div className="ml-auto flex items-center gap-1.5">
            {scoped && (
              <TaskCount
                shown={countColumnTasks(view.filters.filteredProject)}
                total={countColumnTasks(scoped.project)}
              />
            )}
            <ProjectToolbar
              view={view}
              display={
                <TaskDisplayOptions
                  projectId={projectId}
                  sort={sort}
                  onSortChange={setSort}
                  layout={layout === "board" ? "cards" : "rows"}
                />
              }
            />
          </div>
        </div>
        <ActiveFiltersBar
          subjects={view.subjects}
          onClear={view.filters.clearFilters}
          customFieldValues={view.filters.customFieldValues}
        />
        {!board && !isError && (
          <p role="status" className="text-xs text-muted-foreground">
            {t("intelia:initiatives.detail.tasksTab.loading")}
          </p>
        )}
        {scoped && scoped.missing > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("intelia:initiatives.detail.tasksTab.notOnBoard", {
              count: scoped.missing,
            })}
          </p>
        )}
      </div>

      <div
        aria-busy={!board}
        className="relative flex h-[70vh] min-h-96 flex-col overflow-hidden rounded-lg border border-border"
      >
        <TaskOriginsContext.Provider value={origins}>
          <TaskViewBody
            view={view}
            layout={layout}
            sort={sort}
            onSortChange={setSort}
            isError={isError}
            isFetching={isFetching}
            isLoaded={hasAllPages}
            onRetry={() => void refetch()}
            readOnly
            viewKey={viewKey}
            defaultCollapsed={CANCELLED_COLLAPSED}
          />
        </TaskOriginsContext.Provider>
      </div>
    </div>
  );
}
