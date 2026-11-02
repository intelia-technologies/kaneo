import { useMutation, useQueryClient } from "@tanstack/react-query";
import importTasks, { type TaskToImport } from "@/fetchers/task/import-tasks";
import {
  AUTOMATION_QUERY_ROOT,
  type AutomationInput,
} from "@/intelia/automation/api";

import { invalidateMyWork } from "@/lib/invalidate-my-work";

const useImportTasks = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      tasks,
      automation,
    }: {
      projectId: string;
      tasks: TaskToImport[];
      automation: AutomationInput;
    }) => importTasks(projectId, tasks, automation),
    onSuccess: () => {
      invalidateMyWork(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: [AUTOMATION_QUERY_ROOT] });
    },
  });
};

export default useImportTasks;
