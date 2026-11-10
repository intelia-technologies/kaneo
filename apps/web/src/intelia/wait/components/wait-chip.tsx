import { Ban, Hourglass, Rocket, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { taskChipClass } from "@/components/task-chips/task-chip-class";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import type { BlockersSummary } from "@/types/task/blockers-summary";
import { waitLabel } from "../labels";
import { WAIT_TONE_CLASS } from "../reasons";
import { WaitDetail } from "./wait-detail";

function WaitIcon({ reason }: { reason: BlockersSummary["reason"] }) {
  if (reason === "cancelled") return <Ban aria-hidden="true" />;
  if (reason === "person") return <UserRound aria-hidden="true" />;
  if (reason === "ready") return <Rocket aria-hidden="true" />;
  return <Hourglass aria-hidden="true" />;
}

/** Design 55 §3.2: why a To do task waits, coloured by the worst reason. */
export function WaitChip({
  summary,
  className,
}: {
  summary: BlockersSummary;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span />}
        data-wait-reason={summary.reason}
        className={cn(
          taskChipClass,
          "cursor-default",
          WAIT_TONE_CLASS[summary.reason],
          className,
        )}
      >
        <WaitIcon reason={summary.reason} />
        <span className="truncate">{waitLabel(t, summary)}</span>
      </TooltipTrigger>
      <TooltipPopup>
        <WaitDetail summary={summary} />
      </TooltipPopup>
    </Tooltip>
  );
}
