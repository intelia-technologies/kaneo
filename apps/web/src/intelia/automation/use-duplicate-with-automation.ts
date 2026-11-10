import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "@/lib/toast";
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

// Duplicates a task through the dialog, which always asks for Automática,
// verification and delivery (design 48 §3.2), like creating a task. The
// server copies the source's initiative, so the dialog asks for one only
// when the source has none (old or migrated tasks); that is read fresh from
// the API so the decision never rests on a stale or still-loading board map.
export function useDuplicateWithAutomation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ask = useDuplicateAutomationStore((state) => state.ask);

  return useCallback(
    async (request: DuplicateRequest) => {
      try {
        const initiative = await queryClient.fetchQuery({
          queryKey: taskInitiativeKey(request.taskId),
          queryFn: () => getTaskInitiative(request.taskId),
          staleTime: 0,
        });
        ask({ ...request, missingInitiative: !initiative });
      } catch {
        toast.error(t("intelia:automation.loadError"));
      }
    },
    [ask, queryClient, t],
  );
}
