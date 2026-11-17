import type { ProjectWithTasks } from "@/types/project";
import type Task from "@/types/task";

/**
 * The board's task with key `ticket` (`KF-12`): how a batch finds the root
 * the 409 names, which is always one of the tasks it sent.
 */
export function findTaskByTicket(
  project: ProjectWithTasks | null | undefined,
  ticket: string,
): Task | undefined {
  if (!project) return undefined;
  return [
    ...project.columns.flatMap((column) => column.tasks),
    ...project.plannedTasks,
    ...project.archivedTasks,
  ].find((task) => `${project.slug}-${task.number}` === ticket);
}
