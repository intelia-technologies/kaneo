import { useTranslation } from "react-i18next";
import type { BlockersSummary } from "@/types/task/blockers-summary";
import {
  blockerLine,
  externalLabel,
  notStartingLabel,
  rootLabel,
  waitLabel,
} from "../labels";
import { blockersByWorstState } from "../reasons";

/** Design 55 §3.2: what the wait chip shows on hover. */
export function WaitDetail({ summary }: { summary: BlockersSummary }) {
  const { t } = useTranslation();
  const root = summary.root;
  const notStarting =
    summary.reason === "ready" ? notStartingLabel(t, summary) : null;

  return (
    <div className="flex max-w-80 flex-col gap-1 py-1 text-left">
      <p className="font-medium">{waitLabel(t, summary)}</p>
      {summary.blockers.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {blockersByWorstState(summary.blockers).map((blocker) => (
            <li key={blocker.id}>{blockerLine(t, blocker)}</li>
          ))}
        </ul>
      )}
      {summary.externalCount > 0 && (
        <p>{externalLabel(t, summary.externalCount)}</p>
      )}
      {notStarting && (
        <p>
          {t("tasks:readiness.notStartingDetail", {
            reason: notStarting,
            defaultValue: "No arrancará sola: {{reason}}",
          })}
        </p>
      )}
      {root && (
        <p>
          {t("tasks:readiness.rootDetail", {
            root:
              root.kind === "task" && root.task
                ? blockerLine(t, root.task)
                : rootLabel(t, root),
            defaultValue: "Raíz: {{root}}",
          })}
          {root.depth !== null &&
            ` · ${t("tasks:readiness.rootDepth", {
              count: root.depth,
              defaultValue: "nivel {{count}}",
            })}`}
        </p>
      )}
    </div>
  );
}
