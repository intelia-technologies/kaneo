import { Rows3, SquareKanban } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

export type TasksLayout = "list" | "board";

const LAYOUTS = [
  { id: "list", labelKey: "tasks:view.list", icon: Rows3 },
  { id: "board", labelKey: "tasks:view.board", icon: SquareKanban },
] as const;

// The tab's own list/kanban switch: it does not navigate and does not change
// the layout chosen on the project's board.
export function TasksLayoutSwitch({
  value,
  onChange,
}: {
  value: TasksLayout;
  onChange: (layout: TasksLayout) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t("tasks:display.layout")}
      className="flex items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5 dark:bg-input/32"
    >
      {LAYOUTS.map((layout) => {
        const Icon = layout.icon;
        const active = layout.id === value;
        return (
          <button
            key={layout.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(layout.id)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-[calc(var(--radius-lg)-3px)] px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {t(layout.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
