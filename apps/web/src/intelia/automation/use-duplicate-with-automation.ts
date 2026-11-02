import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useDuplicateTask } from "@/hooks/mutations/task/use-duplicate-task";
import { toast } from "@/lib/toast";
import { getTaskAutomation, taskAutomationKey } from "./api";
import {
  getTaskInitiative,
  taskInitiativeKey,
} from "@/intelia/initiatives/api";
import {
  type DuplicateRequest,
  useDuplicateAutomationStore,
} from "./duplicate-store";
import "./i18n";
import "@/intelia/initiatives/i18n";

// Duplicates a task. The server copies the source's level and initiative, so a
// task that has both is duplicated as usual. One missing either (old or
// migrated tasks) cannot be copied without choosing it: that opens the dialog,
// which asks only for what is missing, and the duplicate is sent from there.
// Both are read fresh from the API so the decision never rests on a stale or
// still-loading board map.
export function useDuplicateWithAutomation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mutate } = useDuplicateTask();
  const ask = useDuplicateAutomationStore((state) => state.ask);

  return useCallback(
    async (request: DuplicateRequest) => {
      try {
        const [automation, initiative] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: taskAutomationKey(request.taskId),
            queryFn: () => getTaskAutomation(request.taskId),
            staleTime: 0,
          }),
          queryClient.fetchQuery({
            queryKey: taskInitiativeKey(request.taskId),
            queryFn: () => getTaskInitiative(request.taskId),
            staleTime: 0,
          }),
        ]);

        const missingAutomation = !automation;
        const missingInitiative = !initiative;

        if (!missingAutomation && !missingInitiative) {
          mutate({ taskId: request.taskId, title: request.title });
        } else {
          ask({
            ...request,
            missingAutomation,
            missingInitiative,
          });
        }
      } catch {
        toast.error(t("intelia:automation.loadError"));
      }
    },
    [ask, mutate, queryClient, t],
  );
}
