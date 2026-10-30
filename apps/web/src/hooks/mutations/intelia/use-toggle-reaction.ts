import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "@/lib/toast";
import { addCommentReaction } from "@/fetchers/intelia/add-comment-reaction";
import { addTaskReaction } from "@/fetchers/intelia/add-task-reaction";
import { removeCommentReaction } from "@/fetchers/intelia/remove-comment-reaction";
import { removeTaskReaction } from "@/fetchers/intelia/remove-task-reaction";
import { getTaskReactionsQueryKey } from "@/hooks/queries/intelia/use-task-reactions";

export type ToggleReactionParams = {
  taskId: string;
  commentId: string | null;
  emoji: string;
  hasReacted: boolean;
};

export function useToggleReaction() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      commentId,
      emoji,
      hasReacted,
    }: ToggleReactionParams) => {
      if (hasReacted) {
        if (commentId) {
          return await removeCommentReaction({ commentId, emoji });
        }
        return await removeTaskReaction({ taskId, emoji });
      }
      if (commentId) {
        return await addCommentReaction({ commentId, emoji });
      }
      return await addTaskReaction({ taskId, emoji });
    },
    onSuccess: (_, variables) => {
      return queryClient.invalidateQueries({
        queryKey: getTaskReactionsQueryKey(variables.taskId),
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t("activity:reactions.error", {
              defaultValue: "Failed to update reaction",
            }),
      );
    },
  });
}

export default useToggleReaction;
