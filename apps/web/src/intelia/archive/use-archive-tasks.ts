import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import { archiveTasks } from "./archive-tasks";

export function useArchiveTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: archiveTasks,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      invalidateMyWork(queryClient);
    },
  });
}
