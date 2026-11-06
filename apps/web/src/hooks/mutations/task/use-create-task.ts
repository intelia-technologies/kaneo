import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AUTOMATION_QUERY_ROOT } from "@/intelia/automation/api";
import { INITIATIVE_QUERY_ROOT } from "@/intelia/initiatives/api";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import createTask, { type CreateTaskInput } from "@/fetchers/task/create-task";
import { trackFirstTask } from "@/lib/analytics/activation";

function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      title,
      description,
      userId,
      projectId,
      status,
      startDate,
      dueDate,
      priority,
      customFields,
      draftAssetIds,
      recurrence,
      automation,
      initiative,
      type,
      validationInProduction,
      validationInProductionReason,
    }: CreateTaskInput) =>
      createTask(
        title,
        description,
        projectId,
        userId,
        status,
        startDate ? new Date(startDate) : undefined,
        dueDate ? new Date(dueDate) : undefined,
        priority,
        automation,
        initiative,
        type,
        validationInProduction,
        validationInProductionReason,
        customFields,
        draftAssetIds,
        recurrence,
      ),
    onSuccess: (_data, variables) => {
      invalidateMyWork(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      trackFirstTask();
      void queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["custom-field-values", variables.projectId],
      });
      void queryClient.invalidateQueries({ queryKey: [AUTOMATION_QUERY_ROOT] });
      void queryClient.invalidateQueries({ queryKey: [INITIATIVE_QUERY_ROOT] });
    },
  });
}

export default useCreateTask;
