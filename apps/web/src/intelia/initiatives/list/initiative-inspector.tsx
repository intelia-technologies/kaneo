import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatDateMedium } from "@/lib/format";
import type { InitiativeSummary } from "../api";
import { DesignLink } from "../components/design-link";
import {
  GrowthLine,
  ProgressBar,
  ProgressFigures,
  ScopeBreakdown,
} from "../components/initiative-progress";
import { formatBlockReason, formatTaskIdentifier } from "./format-helpers";
import "./i18n";

type InitiativeInspectorProps = {
  initiative: InitiativeSummary;
  projectSlug?: string | null;
  onOpenTask: (taskId: string) => void;
  onViewDetail: (tab: "tasks" | "tree") => void;
};

export function InitiativeInspector({
  initiative,
  projectSlug,
  onOpenTask,
  onViewDetail,
}: InitiativeInspectorProps) {
  const { t } = useTranslation();
  const { counters } = initiative;
  const isBlocked = counters.blocked > 0;

  return (
    <aside
      aria-label={t("intelia:initiatives.list.inspector.preview")}
      className="sticky top-4 min-w-0 rounded-xl border border-border bg-card/60 p-4 shadow-xs sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-border border-b pb-3">
        <span className="font-medium text-muted-foreground text-xs">
          {t("intelia:initiatives.list.inspector.preview")}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onViewDetail("tasks")}
          className="h-7 gap-1 text-xs"
        >
          {t("intelia:initiatives.list.inspector.viewInitiative")}
        </Button>
      </div>

      <div className="pt-3">
        {isBlocked ? (
          <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-2 py-0.5 font-medium text-destructive text-xs">
            ⊘ {t("intelia:initiatives.list.inspector.requiresAttention")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
            ◴ {t("intelia:initiatives.list.inspector.inFlight")}
          </span>
        )}

        <h2 className="mt-2 min-w-0 break-words font-bold text-foreground text-lg tracking-tight">
          {initiative.name}
        </h2>

        <ProgressFigures counters={counters} className="mt-1 text-xs" />
        <ProgressBar tally={counters} className="my-3" />

        <ScopeBreakdown
          counters={counters}
          className="my-3 sm:grid-cols-1 xl:grid-cols-2"
        />
        <GrowthLine counters={counters} className="mb-4" />

        {initiative.blockedTasks.length > 0 && (
          <div className="space-y-2 border-border border-t pt-4">
            <span className="inline-flex items-center gap-1 font-semibold text-destructive text-xs">
              ⊘{" "}
              {t("intelia:initiatives.list.inspector.blockedTitle", {
                count: initiative.blockedTasks.length,
              })}
            </span>
            <div className="space-y-2">
              {initiative.blockedTasks.map((task) => {
                const taskNum = formatTaskIdentifier(
                  projectSlug,
                  task.number,
                  task.id,
                );
                const reason = formatBlockReason(
                  task.blockReason,
                  task.blockReasonDetail,
                  t("intelia:initiatives.blockReasonNone"),
                );
                return (
                  <div
                    key={task.id}
                    className="space-y-1.5 rounded-lg border border-destructive/20 bg-destructive/5 p-2.5 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenTask(task.id)}
                      className="block w-full min-w-0 cursor-pointer truncate text-left font-medium text-foreground transition-colors hover:text-primary"
                    >
                      {taskNum} · {task.title}
                    </button>
                    <p className="break-words text-[11px] text-muted-foreground leading-relaxed">
                      {reason}
                    </p>
                    <div className="text-[11px] text-muted-foreground/80">
                      {task.assignee?.name ??
                        t("intelia:initiatives.unassigned")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-3 border-border border-t pt-3">
          <div>
            <span className="mb-0.5 block font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
              {t("intelia:initiatives.list.inspector.approvalLabel")}
            </span>
            <p className="text-foreground text-xs">
              {initiative.approvedBy
                ? initiative.approvedAt
                  ? t("intelia:initiatives.list.inspector.approvalBy", {
                      name: initiative.approvedBy,
                      date: formatDateMedium(initiative.approvedAt),
                    })
                  : t("intelia:initiatives.list.inspector.approvalNoDate", {
                      name: initiative.approvedBy,
                    })
                : t("intelia:initiatives.list.inspector.noApproval")}
            </p>
          </div>

          <div>
            <span className="mb-0.5 block font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
              {t("intelia:initiatives.list.inspector.designLabel")}
            </span>
            {initiative.designUrl ? (
              <DesignLink
                url={initiative.designUrl}
                className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
              >
                {t("intelia:initiatives.list.inspector.designDoc")}
              </DesignLink>
            ) : (
              <span className="text-muted-foreground text-xs">
                {t("intelia:initiatives.list.inspector.noDesign")}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 border-border border-t pt-4">
          <Button
            variant="default"
            className="w-full justify-center"
            onClick={() => onViewDetail("tasks")}
          >
            {t("intelia:initiatives.list.inspector.viewInitiative")}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-center"
            onClick={() => onViewDetail("tree")}
          >
            ⌘ {t("intelia:initiatives.list.inspector.tree")}
          </Button>
        </div>
      </div>
    </aside>
  );
}
