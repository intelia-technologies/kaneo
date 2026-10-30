import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertCircle, Flame } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";
import { resolveLabelColor } from "@/lib/label-color";
import type { TaskNodeData } from "../types";

export const TaskNode = memo(function TaskNode({
  data,
  selected,
}: NodeProps & { data: TaskNodeData }) {
  const { t } = useTranslation();

  const isFinished = data.isDone || data.isCancelled;
  const statusColor =
    !isFinished && data.columnColor
      ? resolveLabelColor(data.columnColor)
      : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => data.onOpen(data.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          data.onOpen(data.id);
        }
      }}
      className={cn(
        "group relative flex w-[220px] flex-col gap-1.5 rounded-lg border bg-card p-2.5 shadow-2xs transition-all select-none cursor-pointer",
        data.isCancelled &&
          "border-dashed border-muted-foreground/50 bg-muted/40 opacity-60 grayscale",
        data.isDone &&
          !data.isCancelled &&
          "border-border/70 bg-muted/30 opacity-70 grayscale",
        data.isCritical &&
          "ring-2 ring-amber-500 border-amber-500 dark:ring-amber-400 dark:border-amber-400 shadow-sm",
        selected && "ring-2 ring-primary border-primary",
        !data.isCritical &&
          !selected &&
          !isFinished &&
          "hover:border-foreground/30 hover:shadow-xs",
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

      <div className="flex items-center justify-between gap-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span
            className={cn(
              "flex items-center gap-1 truncate rounded-full px-1.5 py-0.25 text-[10px] font-medium",
              isFinished
                ? "bg-muted text-muted-foreground"
                : !statusColor && "bg-secondary text-secondary-foreground",
            )}
            style={
              statusColor
                ? {
                    backgroundColor: `${statusColor}22`,
                    color: statusColor,
                  }
                : undefined
            }
          >
            {statusColor && (
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: statusColor }}
              />
            )}
            <span className="truncate">{data.statusLabel}</span>
          </span>

          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {data.projectSlug}-{data.number ?? ""}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {data.isBlocked && (
            <span
              className="inline-flex items-center gap-0.5 rounded px-1 py-0.25 text-[10px] font-semibold bg-destructive/15 text-destructive border border-destructive/20"
              title={t("intelia:dependencies.blocked")}
            >
              <AlertCircle className="size-2.5" />
              <span>{t("intelia:dependencies.blocked")}</span>
            </span>
          )}

          {data.isCritical && (
            <span
              className="inline-flex items-center gap-0.5 rounded px-1 py-0.25 text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25"
              title={t("intelia:dependencies.criticalPath")}
            >
              <Flame className="size-2.5" />
            </span>
          )}
        </div>
      </div>

      <p
        className={cn(
          "line-clamp-2 text-xs font-medium leading-snug text-foreground break-words",
          data.isCancelled && "line-through text-muted-foreground",
          data.isDone && !data.isCancelled && "text-muted-foreground",
        )}
      >
        {data.title}
      </p>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1 truncate">
          {data.assigneeName ? (
            <>
              <Avatar className="size-3.5 shrink-0 text-[8px]">
                <AvatarImage
                  src={data.assigneeImage ?? undefined}
                  alt={data.assigneeName}
                />
                <AvatarFallback>
                  {getInitials(data.assigneeName)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{data.assigneeName}</span>
            </>
          ) : (
            <span className="text-muted-foreground/60 italic">
              {t("intelia:dependencies.unassigned")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
