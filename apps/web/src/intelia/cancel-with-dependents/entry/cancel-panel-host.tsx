import { useTranslation } from "react-i18next";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { toast } from "@/lib/toast";
import { CancelWithDependentsPanel } from "../components/cancel-with-dependents-panel";
import { useCancelPanelStore } from "./cancel-panel-store";
import "../i18n";

/** Panel D for whichever path got the 409, mounted once. */
export function CancelPanelHost() {
  const { t } = useTranslation();
  const request = useCancelPanelStore((state) => state.request);
  const close = useCancelPanelStore((state) => state.close);
  const { data: workspace } = useActiveWorkspace();

  return (
    <CancelWithDependentsPanel
      error={request?.error ?? null}
      taskId={request?.taskId ?? ""}
      workspaceId={workspace?.id ?? ""}
      onClose={close}
      onCancelled={(result) => {
        toast.success(
          t("intelia:cancelWithDependents.done", {
            count: result.canceladas.length,
          }),
        );
        // It may land after the panel was closed and opened for another root.
        if (useCancelPanelStore.getState().request === request) close();
      }}
    />
  );
}
