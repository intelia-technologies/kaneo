import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ExternalLink, Flame } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ExternalNodeData } from "../types";

export const ExternalNode = memo(function ExternalNode({
  data,
  selected,
}: NodeProps & { data: ExternalNodeData }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const taskRef =
    data.number !== null
      ? `${data.projectSlug}-${data.number}`
      : data.projectSlug;

  const accessibleName = data.sameProject
    ? `${taskRef} · ${data.title}`
    : t("intelia:dependencies.openExternal", {
        task: taskRef,
        project: data.projectName,
      });

  const {
    id: taskId,
    sameProject,
    onOpen,
    workspaceId,
    projectId: externalProjectId,
  } = data;

  const handleOpen = useCallback(() => {
    if (sameProject && onOpen) {
      onOpen(taskId);
      return;
    }
    navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
      params: {
        workspaceId,
        projectId: externalProjectId,
      },
      search: {
        taskId,
      },
    });
  }, [sameProject, onOpen, taskId, navigate, workspaceId, externalProjectId]);

  const frontierLabel = sameProject
    ? (data.scopeName ??
      data.initiativeName ??
      t("intelia:dependencies.withoutInitiative"))
    : data.projectName;

  const containerClasses = cn(
    "group relative flex w-[180px] flex-col gap-1 rounded-lg border border-dashed border-border/90 bg-muted/30 p-2 shadow-2xs select-none transition-all cursor-pointer hover:border-foreground/30 hover:shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary",
    data.isCritical &&
      "ring-2 ring-amber-500 border-amber-500 dark:ring-amber-400 dark:border-amber-400 shadow-sm",
    selected && "ring-2 ring-primary border-primary",
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpen();
    }
  };

  const innerContent = (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!size-1.5 !border-none !bg-muted-foreground group-hover:!bg-primary transition-colors"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-1.5 !border-none !bg-muted-foreground group-hover:!bg-primary transition-colors"
      />

      <div className="flex items-center justify-between gap-1 text-[9px]">
        <span className="rounded bg-secondary/80 px-1 py-0.25 font-medium text-secondary-foreground truncate">
          {t("intelia:dependencies.externalTask")}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {data.isCritical && (
            <span
              className="inline-flex items-center gap-0.5 rounded px-1 py-0.25 text-[9px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25"
              title={
                data.criticalLabel ?? t("intelia:dependencies.criticalPath")
              }
            >
              <Flame className="size-2" />
              <span>{t("intelia:dependencies.chainBadge")}</span>
            </span>
          )}
          <span className="font-mono text-muted-foreground truncate">
            {data.projectSlug}-{data.number ?? ""}
          </span>
        </div>
      </div>

      <p className="line-clamp-1 text-xs font-medium text-foreground break-words">
        {data.title}
      </p>
      {data.planMark && (
        <p className="text-xs font-medium" title={data.planReason}>
          ◆ {data.planMark}
          {data.planReason ? `: ${data.planReason}` : ""}
        </p>
      )}

      <div className="flex items-center justify-between text-[9px] text-muted-foreground">
        <span className="truncate">{data.status}</span>
        <span className="inline-flex items-center gap-0.5 text-primary">
          <span className="truncate max-w-[70px]">{frontierLabel}</span>
          {!sameProject && <ExternalLink className="size-2 shrink-0" />}
        </span>
      </div>
    </>
  );

  if (sameProject) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={accessibleName}
        title={accessibleName}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        className={containerClasses}
      >
        {innerContent}
      </div>
    );
  }

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={accessibleName}
      title={accessibleName}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      className={containerClasses}
    >
      {innerContent}
    </div>
  );
});
