import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useInitiativePlan } from "@/intelia/initiatives/api";
import { useExternalPlanRealtime } from "@/intelia/initiatives/use-external-plan-realtime";
import "../i18n";
import { useDependenciesGraph } from "../use-dependencies-graph";
import { DependenciesView } from "./dependencies-view";

export type InitiativeTreeProps = {
  projectId: string;
  workspaceId: string;
  initiativeId: string;
  showCancelled: boolean;
  onShowCancelledChange: (value: boolean) => void;
  onOpenTask: (taskId: string) => void;
};

export function InitiativeTree({
  projectId,
  workspaceId,
  initiativeId,
  showCancelled,
  onShowCancelledChange,
  onOpenTask,
}: InitiativeTreeProps) {
  const { t } = useTranslation();
  const switchId = useId();
  const [showLoose, setShowLoose] = useState(true);

  const { graphModel, isLoading, isError, refetch } = useDependenciesGraph({
    projectId,
    workspaceId,
    initiativeId,
    showLoose,
    showCancelled,
    onOpenTask,
  });
  const {
    data: plan,
    isError: isPlanError,
    refetch: refetchPlan,
  } = useInitiativePlan(projectId, initiativeId);
  useExternalPlanRealtime(plan);
  const model = useMemo(() => {
    const critical = new Map(
      (plan?.tasks ?? [])
        .filter((task) => task.critical && task.mark)
        .map((task) => [task.id, task]),
    );
    return {
      ...graphModel,
      nodes: graphModel.nodes.map((node) => {
        const task = critical.get(node.id);
        if (!task?.mark)
          return plan
            ? { ...node, data: { ...node.data, isCritical: false } }
            : node;
        const reason = [
          task.blockReason,
          task.blockReasonDetail,
          task.stallReason &&
            t(`intelia:initiatives.detail.plan.reasons.${task.stallReason}`),
        ]
          .filter(Boolean)
          .join(" — ");
        return {
          ...node,
          data: {
            ...node.data,
            isCritical: true,
            planMark: t(`intelia:initiatives.detail.plan.marks.${task.mark}`),
            planReason: reason,
          },
        };
      }),
      edges: plan
        ? graphModel.edges.map((edge) => {
            const path = plan.criticalPath.taskIds;
            const index = path.indexOf(edge.source);
            const isCritical = index >= 0 && path[index + 1] === edge.target;
            const color = isCritical
              ? "#f59e0b"
              : "var(--muted-foreground, #71717a)";
            return {
              ...edge,
              animated: isCritical,
              style: {
                ...edge.style,
                stroke: color,
                strokeWidth: isCritical ? 2.5 : 1.5,
              },
              markerEnd: {
                type: "arrowclosed" as const,
                color,
                width: 14,
                height: 14,
              },
            };
          })
        : graphModel.edges,
    };
  }, [graphModel, plan, t]);
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between border-b px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Switch
            id={switchId}
            checked={showCancelled}
            onCheckedChange={(checked) => onShowCancelledChange(checked)}
          />
          <label
            htmlFor={switchId}
            className="cursor-pointer select-none font-medium text-muted-foreground"
          >
            {t("intelia:dependencies.showCancelled")}
          </label>
        </div>

        <Link
          to="/dashboard/workspace/$workspaceId/project/$projectId/dependencies"
          params={{ workspaceId, projectId }}
          search={{ initiativeId }}
          className="inline-flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <span>{t("intelia:dependencies.openInDependencies")}</span>
          <ExternalLink className="size-3" />
        </Link>
      </div>
      {isPlanError && (
        <div role="alert" className="px-4 py-2 text-xs">
          {t("intelia:initiatives.loadError")}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void refetchPlan()}
          >
            {t("intelia:initiatives.retry")}
          </button>
        </div>
      )}

      <div className="relative min-h-0 w-full flex-1">
        <DependenciesView
          model={model}
          showLoose={showLoose}
          onToggleShowLoose={() => setShowLoose(true)}
          isLoading={isLoading}
          isError={isError}
          onRetry={refetch}
        />
      </div>
    </div>
  );
}
