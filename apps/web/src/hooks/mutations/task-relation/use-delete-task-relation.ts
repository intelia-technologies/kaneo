import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteTaskRelation from "@/fetchers/task-relation/delete-task-relation";

import { invalidateRelationTaskProject } from "./invalidate-relation-task-project";

function useDeleteTaskRelation(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTaskRelation,
    onSuccess: (relation) => {
      void invalidateRelationTaskProject(queryClient);
      queryClient.invalidateQueries({
        queryKey: ["task-relations", taskId],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "task-relations",
          relation.sourceTaskId === taskId
            ? relation.targetTaskId
            : relation.sourceTaskId,
        ],
      });
    },
  });
}

export default useDeleteTaskRelation;
