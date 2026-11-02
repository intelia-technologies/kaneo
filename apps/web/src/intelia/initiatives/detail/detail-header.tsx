import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatDateMedium } from "@/lib/format";
import type { InitiativeDetail } from "../api";
import { ProgressFigures } from "../components/initiative-progress";
import { EditInitiativeDialog } from "./edit-initiative-dialog";
import { rememberedListSearch } from "../search";

type DetailHeaderProps = {
  workspaceId: string;
  projectId: string;
  initiative: InitiativeDetail;
};

export function DetailHeader({
  workspaceId,
  projectId,
  initiative,
}: DetailHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const handleBack = () => {
    navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/initiatives",
      params: { workspaceId, projectId },
      search: rememberedListSearch(projectId),
    });
  };

  const approvalText = initiative.approvedBy
    ? initiative.approvedAt
      ? t("intelia:initiatives.detail.approvedByOn", {
          name: initiative.approvedBy,
          date: formatDateMedium(initiative.approvedAt),
        })
      : t("intelia:initiatives.detail.approvedByOnly", {
          name: initiative.approvedBy,
        })
    : t("intelia:initiatives.detail.noApproval");

  const planText = initiative.planClosedAt
    ? t("intelia:initiatives.detail.planClosedOn", {
        date: formatDateMedium(initiative.planClosedAt),
      })
    : t("intelia:initiatives.detail.planOpen");

  const stateClass: Record<string, string> = {
    in_flight: "bg-primary/10 text-primary border-primary/20",
    finished:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    no_tasks: "bg-muted text-muted-foreground border-border",
    all_cancelled: "bg-muted text-muted-foreground border-border",
  };

  return (
    <header className="space-y-4">
      <div>
        <button
          type="button"
          onClick={handleBack}
          className="text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
        >
          {t("intelia:initiatives.detail.back")}
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {initiative.name}
            </h1>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                stateClass[initiative.state] ??
                "bg-muted text-muted-foreground border-border"
              }`}
            >
              {t(`intelia:initiatives.state.${initiative.state}`)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <ProgressFigures counters={initiative.counters} />
            {initiative.counters.added.total > 0 && (
              <span className="rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-400">
                {t("intelia:initiatives.scope.added", {
                  count: initiative.counters.added.total,
                })}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {initiative.designUrl ? (
            <a
              href={initiative.designUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground"
            >
              {t("intelia:initiatives.detail.design")}
            </a>
          ) : (
            <span className="inline-flex h-8 items-center justify-center rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground/60 cursor-not-allowed">
              {t("intelia:initiatives.detail.noDesign")}
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditDialogOpen(true)}
          >
            {t("intelia:initiatives.detail.edit")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-b border-border pb-3">
        <span>{approvalText}</span>
        <span aria-hidden="true">·</span>
        <span>{planText}</span>
      </div>

      <EditInitiativeDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        initiative={initiative}
      />
    </header>
  );
}
