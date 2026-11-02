import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { InitiativeSummary } from "../api";
import {
  ProgressBar,
  ProgressFigures,
} from "../components/initiative-progress";
import "./i18n";

type InitiativeListRowProps = {
  initiative: InitiativeSummary;
  isSelected: boolean;
  onSelect: () => void;
};

export function InitiativeListRow({
  initiative,
  isSelected,
  onSelect,
}: InitiativeListRowProps) {
  const { t } = useTranslation();
  const { counters } = initiative;
  const ref = useRef<HTMLButtonElement>(null);
  const selectedOnMount = useRef(isSelected);

  // Coming back from the detail, the selected row is in view again.
  useEffect(() => {
    if (selectedOnMount.current)
      ref.current?.scrollIntoView?.({ block: "nearest" });
  }, []);

  const scopeText =
    t("intelia:initiatives.list.row.planAndAdded", {
      count: counters.added.total,
      plan: counters.plan.total,
      added: counters.added.total,
    }) +
    (counters.unrecorded.total > 0
      ? t("intelia:initiatives.list.row.unrecorded", {
          count: counters.unrecorded.total,
        })
      : "");

  return (
    <button
      ref={ref}
      type="button"
      data-testid="initiative-row"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        "group w-full min-w-0 cursor-pointer rounded-xl border p-3.5 sm:p-4 text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        isSelected
          ? "border-primary/60 bg-primary/5 shadow-xs dark:bg-primary/10"
          : "border-border bg-card/60 hover:border-border/80 hover:bg-accent/40",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1">
        <strong className="min-w-0 max-w-full truncate font-semibold text-foreground text-sm">
          {initiative.name}
        </strong>
        <ProgressFigures counters={counters} className="text-xs" />
      </div>

      <ProgressBar tally={counters} className="my-2.5" />

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-muted-foreground text-xs">
        <span className="min-w-0 break-words">{scopeText}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
        {counters.blocked > 0 ? (
          <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive text-xs">
            ⊘ {t("intelia:initiatives.blocked", { count: counters.blocked })}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
            ◴ {t("intelia:initiatives.list.row.inExecution")}
          </span>
        )}
      </div>
    </button>
  );
}
