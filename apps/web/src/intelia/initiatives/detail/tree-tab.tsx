import { AlertTriangleIcon, CircleSlashIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InitiativeTree } from "@/intelia/dependencies/components/initiative-tree";
import type { InitiativeDetail } from "../api";
import type { InitiativeDetailSearch } from "../search";

type TreeTabProps = {
  projectId: string;
  workspaceId: string;
  initiativeId: string;
  initiative: InitiativeDetail;
  search: InitiativeDetailSearch;
  onShowCancelledChange: (cancelled: boolean) => void;
  onOpenTask: (taskId: string) => void;
};

export function TreeTab({
  projectId,
  workspaceId,
  initiativeId,
  initiative,
  search,
  onShowCancelledChange,
  onOpenTask,
}: TreeTabProps) {
  const { t } = useTranslation();
  const { pendingChain, counters } = initiative;
  // A pending task of a project the reader cannot see also leaves the chain
  // incomplete (design 52 §3.1), as in the plan.
  const partial =
    pendingChain.partial || counters.hidden.active > counters.hidden.done;

  return (
    <div className="space-y-4 pt-2">
      {partial && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-medium text-amber-800 dark:text-amber-300"
        >
          <AlertTriangleIcon className="size-4 shrink-0" />
          <span>{t("intelia:initiatives.detail.chainPartial")}</span>
        </div>
      )}

      {pendingChain.cycle && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive"
        >
          <CircleSlashIcon className="size-4 shrink-0" />
          <span>{t("intelia:initiatives.detail.chainCycle")}</span>
        </div>
      )}

      <div className="h-[70vh] min-h-[480px] w-full overflow-hidden rounded-lg border border-border bg-card">
        <InitiativeTree
          projectId={projectId}
          workspaceId={workspaceId}
          initiativeId={initiativeId}
          showCancelled={Boolean(search.cancelled)}
          onShowCancelledChange={onShowCancelledChange}
          onOpenTask={onOpenTask}
        />
      </div>
    </div>
  );
}
