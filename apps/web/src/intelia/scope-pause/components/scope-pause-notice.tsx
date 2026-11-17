import { ChevronDownIcon, PauseCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { ScopePause } from "../api";
import { formatReviewDate, pauseAuthor } from "../pause-text";
import { ScopePauseHistory } from "./scope-pause-history";
import "../i18n";

// Design 81 §4.1: on the paused scope, who paused it and when, why, and the
// date to review it, with the pause's history on demand.
export function ScopePauseNotice({
  pause,
  className,
}: {
  pause: ScopePause;
  className?: string;
}) {
  const { t } = useTranslation();
  const [historyOpen, setHistoryOpen] = useState(false);
  const who =
    pauseAuthor(pause.pausedByName, pause.pausedByActor) ??
    t("intelia:scopePause.unknownAuthor");

  return (
    <section
      aria-label={t(`intelia:scopePause.notice.${pause.scopeType}`)}
      data-scope-pause-notice={pause.scopeType}
      className={cn(
        "flex flex-col gap-1 rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-sm dark:bg-warning/16",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <PauseCircle
          aria-hidden="true"
          className="size-4 shrink-0 text-warning-foreground"
        />
        <span className="font-medium text-warning-foreground">
          {t(`intelia:scopePause.notice.${pause.scopeType}`)}
        </span>
        <span className="text-muted-foreground text-xs">
          {t("intelia:scopePause.notice.pausedBy", {
            who,
            date: formatDateTime(pause.pausedAt),
          })}
        </span>
        <span aria-hidden="true" className="text-muted-foreground text-xs">
          ·
        </span>
        <span
          className="font-medium text-foreground text-xs"
          data-scope-pause-review
        >
          {t("intelia:scopePause.notice.review", {
            date: formatReviewDate(pause.revisarEl),
          })}
        </span>
      </div>
      <p className="break-words text-foreground" data-scope-pause-motivo>
        {pause.motivo}
      </p>
      <p className="text-muted-foreground text-xs">
        {t("intelia:scopePause.notice.explanation")}
      </p>
      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
          {t("intelia:scopePause.history.title")}
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              "size-3.5 transition-transform duration-200",
              historyOpen && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsiblePanel className="pt-1.5">
          {historyOpen && <ScopePauseHistory pauseId={pause.id} />}
        </CollapsiblePanel>
      </Collapsible>
    </section>
  );
}
