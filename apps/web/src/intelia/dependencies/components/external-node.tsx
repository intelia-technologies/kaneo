import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ExternalNodeData } from "../types";

export const ExternalNode = memo(function ExternalNode({
  data,
  selected,
}: NodeProps & { data: ExternalNodeData }) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "group relative flex w-[180px] flex-col gap-1 rounded-lg border border-dashed border-border/90 bg-muted/30 p-2 shadow-2xs select-none transition-all",
        selected && "ring-2 ring-primary border-primary",
      )}
    >
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
        <span className="font-mono text-muted-foreground truncate">
          {data.projectSlug}-{data.number ?? ""}
        </span>
      </div>

      <p className="line-clamp-1 text-xs font-medium text-foreground break-words">
        {data.title}
      </p>

      <div className="flex items-center justify-between text-[9px] text-muted-foreground">
        <span className="truncate">{data.status}</span>
        <Link
          to="/dashboard/workspace/$workspaceId/project/$projectId/board"
          params={{
            workspaceId: data.workspaceId,
            projectId: data.projectId,
          }}
          className="inline-flex items-center gap-0.5 text-primary hover:underline"
          title={t("intelia:dependencies.openExternal", {
            project: data.projectName,
          })}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="truncate max-w-[70px]">{data.projectName}</span>
          <ExternalLink className="size-2 shrink-0" />
        </Link>
      </div>
    </div>
  );
});
