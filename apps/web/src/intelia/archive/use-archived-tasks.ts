import { useQuery } from "@tanstack/react-query";
import { getArchivedTasks } from "./get-archived-tasks";

// Under the board's key: whatever refreshes the board (realtime events, task
// mutations, archiving) refreshes the archived tasks too. Three parts, so the
// board-only cache writers, which look for two, leave it alone.
export const archivedTasksKey = (projectId: string) =>
  ["tasks", projectId, "intelia-archived"] as const;

// Only while the archived section is open: loading the backlog must not page
// through every archived task (design 53 §3.2 keeps the board fast).
export function useArchivedTasks(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: archivedTasksKey(projectId),
    queryFn: ({ signal }) => getArchivedTasks(projectId, signal),
    enabled: !!projectId && enabled,
  });
}
