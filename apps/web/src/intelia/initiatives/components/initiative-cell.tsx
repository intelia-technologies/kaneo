import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { stopCardEvents } from "@/components/task-chips/stop-card-events";
import { cn } from "@/lib/cn";
import type { TaskInitiativeRef } from "@/types/task";
import { INITIATIVE_COLUMN_CLASS } from "@/intelia/wait/columns";
import "../i18n";

type InitiativeCellProps = {
  initiative: TaskInitiativeRef | null | undefined;
  workspaceId: string;
};

/**
 * KF-23: the list's «Iniciativa» column. The initiative's name links to its
 * panel, also for one of another project; one whose project the reader cannot
 * read shows no name and no link (design 52 §3.1).
 */
export function InitiativeCell({
  initiative,
  workspaceId,
}: InitiativeCellProps) {
  const { t } = useTranslation();
  const label = (
    <span className="sr-only">{t("intelia:initiative.title")}: </span>
  );
  const className = cn(
    INITIATIVE_COLUMN_CLASS,
    "truncate text-muted-foreground text-xs",
  );

  if (!initiative) {
    return <span className={className}>{label}—</span>;
  }
  if (initiative.name === null) {
    return (
      <span className={className} title={t("intelia:initiative.otherProject")}>
        {label}
        {t("intelia:initiative.otherProjectShort")}
      </span>
    );
  }
  return (
    <span className={className}>
      {label}
      <Link
        to="/dashboard/workspace/$workspaceId/project/$projectId/initiatives/$initiativeId"
        params={{
          workspaceId,
          projectId: initiative.projectId,
          initiativeId: initiative.id,
        }}
        title={initiative.name}
        className="rounded-sm outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/25"
        {...stopCardEvents}
      >
        {initiative.name}
      </Link>
    </span>
  );
}
