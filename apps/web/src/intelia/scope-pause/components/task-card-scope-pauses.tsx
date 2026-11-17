import { PauseCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import type Task from "@/types/task";
import { useActiveScopePauses } from "../api";
import { pausesCoveringTask } from "../pause-index";
import { formatReviewDate, pauseAuthor } from "../pause-text";
import "../i18n";

// Design 81 §4.1: a chip per active pause covering the task, its project's
// and its initiative's (which may live on another board), with the details
// in the tooltip. Nothing when none does.
export function TaskCardScopePauses({
  task,
}: {
  task: Pick<Task, "id" | "projectId">;
}) {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const { data } = useActiveScopePauses(workspace?.id);
  const pauses = data ? pausesCoveringTask(data, task) : [];
  if (pauses.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {pauses.map((pause) => {
        const scope = t(`intelia:scopePause.chip.${pause.scopeType}`);
        const title = t("intelia:scopePause.chip.title", {
          scope,
          name: pause.scopeName,
          who:
            pauseAuthor(pause.pausedByName, pause.pausedByActor) ??
            t("intelia:scopePause.unknownAuthor"),
          motivo: pause.motivo,
          date: formatReviewDate(pause.revisarEl),
        });
        return (
          <Badge
            key={pause.id}
            variant="warning"
            size="sm"
            className="min-w-0 max-w-56 gap-1"
            title={title}
            data-scope-pause={pause.scopeType}
          >
            <PauseCircle aria-hidden="true" />
            <span className="truncate">
              {pause.scopeType === "initiative"
                ? `${scope}: ${pause.scopeName}`
                : scope}
            </span>
          </Badge>
        );
      })}
    </div>
  );
}
