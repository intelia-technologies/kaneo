import { useQuery } from "@tanstack/react-query";
import { getTaskReactions } from "@/fetchers/intelia/get-task-reactions";
import type { Reaction } from "@/types/reaction";

export const INTELIA_REACTIONS_QUERY_KEY = "intelia-reactions";

export function getTaskReactionsQueryKey(taskId: string) {
  return [INTELIA_REACTIONS_QUERY_KEY, taskId] as const;
}

export function useTaskReactions(taskId: string | undefined) {
  return useQuery<Reaction[]>({
    queryKey: getTaskReactionsQueryKey(taskId ?? ""),
    queryFn: () => getTaskReactions(taskId ?? ""),
    enabled: Boolean(taskId),
  });
}

export default useTaskReactions;
