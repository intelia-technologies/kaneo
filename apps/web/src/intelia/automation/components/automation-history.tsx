import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/lib/format";
import type { TaskAutomationChange } from "../api";
import { type DiaryValue, diaryValues } from "../history-values";
import "../i18n";

// The diary of a task's automation, newest first: each change with its date,
// the value before and after, the author and, if not a session, the origin.
export function AutomationHistory({
  history,
}: {
  history: readonly TaskAutomationChange[];
}) {
  const { t } = useTranslation();
  const describe = (value: DiaryValue) =>
    [
      value.automatica
        ? t("intelia:automation.card.automatica")
        : value.pausaMotivo
          ? t("intelia:automation.card.paused", { motivo: value.pausaMotivo })
          : t("intelia:automation.card.manual"),
      value.verification
        ? t("intelia:automation.verified")
        : t("intelia:automation.notVerified"),
      value.entrega && t(`intelia:automation.card.entrega.${value.entrega}`),
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">
        {t("intelia:automation.history")}
      </span>
      {history.length === 0 ? (
        <span className="text-muted-foreground/70 text-xs">
          {t("intelia:automation.noHistory")}
        </span>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {diaryValues(history).map(({ entry, from, to }) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-baseline gap-x-2 text-xs"
            >
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {formatDateTime(entry.changedAt)}
              </span>
              <span className="text-foreground/85">
                {from
                  ? t("intelia:automation.change", {
                      from: describe(from),
                      to: describe(to),
                    })
                  : t("intelia:automation.firstSet", { to: describe(to) })}
              </span>
              <span className="text-muted-foreground/70">
                {entry.changedByName ??
                  entry.changedByActor ??
                  t(`intelia:automation.source.${entry.source}`)}
                {entry.source !== "session" &&
                  ` · ${t(`intelia:automation.source.${entry.source}`)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
