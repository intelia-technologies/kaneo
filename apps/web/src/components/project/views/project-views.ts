import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  ChartGantt,
  Rows3,
  SquareKanban,
  SquircleDashed,
} from "lucide-react";
import type { TaskLayout } from "@/store/user-preferences";
import { INTELIA_PATHS, INTELIA_VIEWS, isInteliaView } from "@/intelia/view";

export type ProjectView = TaskLayout | "backlog";

export type ProjectRoute = Exclude<ProjectView, "list">;

export const PROJECT_ROUTE_PATHS = {
  board: "/dashboard/workspace/$workspaceId/project/$projectId/board",
  backlog: "/dashboard/workspace/$workspaceId/project/$projectId/backlog",
  calendar: "/dashboard/workspace/$workspaceId/project/$projectId/calendar",
  gantt: "/dashboard/workspace/$workspaceId/project/$projectId/gantt",
  ...INTELIA_PATHS,
} as const;

export const PROJECT_VIEWS: ReadonlyArray<{
  id: ProjectView;
  labelKey: string;
  icon: LucideIcon;
}> = [
  {
    id: "board",
    labelKey: "tasks:view.board",
    icon: SquareKanban,
  },
  {
    id: "list",
    labelKey: "tasks:view.list",
    icon: Rows3,
  },
  {
    id: "backlog",
    labelKey: "tasks:view.backlog",
    icon: SquircleDashed,
  },
  {
    id: "calendar",
    labelKey: "tasks:calendar.title",
    icon: CalendarDays,
  },
  {
    id: "gantt",
    labelKey: "tasks:view.gantt",
    icon: ChartGantt,
  },
  ...INTELIA_VIEWS,
];

export function routeForView(view: ProjectView): ProjectRoute {
  return view === "list" ? "board" : view;
}

export function resolveProjectView(
  route: ProjectRoute,
  viewMode: "board" | "list",
): ProjectView {
  return route === "board" ? viewMode : route;
}

// Our views are their own links in `ProjectScopeToggle`, not task layouts.
export const TASK_LAYOUTS = PROJECT_VIEWS.filter(
  (view) => view.id !== "backlog" && !isInteliaView(view.id),
);

export function tasksViewFor(
  taskLayout: TaskLayout,
  viewMode: "board" | "list",
): ProjectView {
  return taskLayout !== "board" &&
    taskLayout !== "list" &&
    !isInteliaView(taskLayout)
    ? taskLayout
    : viewMode;
}
