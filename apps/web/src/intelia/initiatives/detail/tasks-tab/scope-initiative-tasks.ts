import { filterProjectTasks } from "@/lib/task-filters/filter-project-tasks";
import type { ProjectWithTasks } from "@/types/project";
import type { TaskOrigins } from "../../origin/origin";

// The project's board with only the initiative's tasks, as a new object: the
// project in the store and in the tasks cache stays whole (design 19 annex
// §3), so the project's board still has all its tasks.
// `missing` counts the initiative's tasks the board does not show: of another
// project, in the backlog or archived.
export function scopeInitiativeTasks(
  board: ProjectWithTasks,
  origins: TaskOrigins,
): { project: ProjectWithTasks; missing: number } {
  const project = filterProjectTasks(board, (task) => origins.has(task.id));
  const shown = project.columns.reduce(
    (count, column) => count + column.tasks.length,
    0,
  );
  return { project, missing: origins.size - shown };
}
