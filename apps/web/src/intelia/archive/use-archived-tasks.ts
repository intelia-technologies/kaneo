import { useQuery } from "@tanstack/react-query";
import { getArchivedTasks } from "./get-archived-tasks";

// Under the board's key: whatever refreshes the board (realtime events, task
// mutations, archiving) refreshes the archived tasks too. Three parts, so the
// board-only cache writers, which look for two, leave it alone.
export const archivedTasksKey = (projectId: string) =>
  ["tasks", projectId, "intelia-archived"] as const;

export function useArchivedTasks(projectId: string) {
  return useQuery({
    queryKey: archivedTasksKey(projectId),
    queryFn: ({ signal }) => getArchivedTasks(projectId, signal),
    enabled: !!projectId,
  });
}
