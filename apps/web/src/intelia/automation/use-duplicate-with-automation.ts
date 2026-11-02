import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useDuplicateTask } from "@/hooks/mutations/task/use-duplicate-task";
import { toast } from "@/lib/toast";
import { getTaskAutomation, taskAutomationKey } from "./api";
import {
  type DuplicateRequest,
  useDuplicateAutomationStore,
} from "./duplicate-store";
import "./i18n";

// Duplicates a task. The server copies the level of the source, so a task
// that has one is duplicated as usual. One without a level (old tasks) cannot
// be copied without choosing one: that opens the level dialog instead and the
// duplicate is sent from there. The source's level is read fresh from the API
// so the decision never rests on a stale or still-loading board map.
export function useDuplicateWithAutomation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mutate } = useDuplicateTask();
  const ask = useDuplicateAutomationStore((state) => state.ask);

  return useCallback(
    async (request: DuplicateRequest) => {
      try {
        const current = await queryClient.fetchQuery({
          queryKey: taskAutomationKey(request.taskId),
          queryFn: () => getTaskAutomation(request.taskId),
          staleTime: 0,
        });
        if (current) mutate(request);
        else ask(request);
      } catch {
        toast.error(t("intelia:automation.loadError"));
      }
    },
    [ask, mutate, queryClient, t],
  );
}
