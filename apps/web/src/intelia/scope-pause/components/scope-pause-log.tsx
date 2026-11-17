import { HistoryIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateTime } from "@/lib/format";
import { useAllScopePauses } from "../api";
import { type PauseScope, pausesOfScope } from "../pause-index";
import { ScopePauseHistory } from "./scope-pause-history";
import "../i18n";

// The scope's pause history, reachable whether or not it is paused now: every
// pause it had, active or resumed, each with its changes. Loaded on opening.
export function ScopePauseLog({
  workspaceId,
  scope,
}: {
  workspaceId: string;
  scope: PauseScope;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useAllScopePauses(workspaceId, open);
  const pauses = data ? pausesOfScope(data, scope) : [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          aria-label={t("intelia:scopePause.history.title")}
        >
          <HistoryIcon aria-hidden="true" className="size-3.5" />
          <span className="hidden sm:inline">
            {t("intelia:scopePause.history.title")}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto"
      >
        <PopoverTitle className="mb-2 font-medium text-sm">
          {t("intelia:scopePause.history.title")}
        </PopoverTitle>
        {isLoading ? (
          <p className="text-muted-foreground text-xs">
            {t("intelia:scopePause.history.loading")}
          </p>
        ) : isError ? (
          <p role="alert" className="text-destructive-foreground text-xs">
            {t("intelia:scopePause.history.loadError")}
          </p>
        ) : pauses.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {t("intelia:scopePause.history.noPauses")}
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {pauses.map((pause) => (
              <li
                key={pause.id}
                className="flex flex-col gap-1.5 border-border border-l pl-3"
                data-scope-pause-log={pause.resumedAt ? "resumed" : "active"}
              >
                <span className="font-medium text-foreground text-xs">
                  {pause.resumedAt
                    ? t("intelia:scopePause.history.resumedPause", {
                        from: formatDateTime(pause.pausedAt),
                        to: formatDateTime(pause.resumedAt),
                      })
                    : t("intelia:scopePause.history.activePause", {
                        from: formatDateTime(pause.pausedAt),
                      })}
                </span>
                <ScopePauseHistory pauseId={pause.id} />
              </li>
            ))}
          </ol>
        )}
      </PopoverContent>
    </Popover>
  );
}
