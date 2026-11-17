import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/lib/format";
import { type ScopePauseChange, useScopePauseHistory } from "../api";
import { formatReviewDate, pauseAuthor } from "../pause-text";
import "../i18n";

const FIELDS = ["motivo", "revisarEl", "notaReanudar"] as const;
type Field = (typeof FIELDS)[number];

function fieldText(field: Field, value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  return field === "revisarEl" ? formatReviewDate(value) : value;
}

// The pause's changes in the order the API gives them, oldest first: its
// creation, each change of reason or review date, and its resumption.
export function ScopePauseHistory({ pauseId }: { pauseId: string }) {
  const { t } = useTranslation();
  const { data: history, isLoading, isError } = useScopePauseHistory(pauseId);

  if (isLoading) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("intelia:scopePause.history.loading")}
      </p>
    );
  }
  if (isError || !history) {
    return (
      <p role="alert" className="text-destructive-foreground text-xs">
        {t("intelia:scopePause.history.loadError")}
      </p>
    );
  }
  if (history.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("intelia:scopePause.history.empty")}
      </p>
    );
  }
  return (
    <ol
      className="flex flex-col gap-1.5"
      aria-label={t("intelia:scopePause.history.title")}
    >
      {history.map((change) => (
        <li
          key={change.id}
          className="flex flex-col gap-0.5 text-xs"
          data-scope-pause-change={change.kind}
        >
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-foreground">
              {t(`intelia:scopePause.history.kind.${change.kind}`)}
            </span>
            <span className="text-muted-foreground">
              {pauseAuthor(change.userName, change.actor) ??
                t("intelia:scopePause.unknownAuthor")}
            </span>
            {change.source !== "session" && (
              <span className="text-muted-foreground/70">
                {t(`intelia:scopePause.history.source.${change.source}`, {
                  defaultValue: change.source,
                })}
              </span>
            )}
            <time
              dateTime={change.createdAt}
              className="text-muted-foreground/70 tabular-nums"
            >
              {formatDateTime(change.createdAt)}
            </time>
          </div>
          <ChangeFields change={change} />
        </li>
      ))}
    </ol>
  );
}

function ChangeFields({ change }: { change: ScopePauseChange }) {
  const { t } = useTranslation();
  const rows = FIELDS.flatMap((field) => {
    const next = fieldText(field, change.value[field]);
    if (next === null) return [];
    const before =
      change.kind === "updated"
        ? fieldText(field, change.previous?.[field])
        : null;
    return [{ field, before, next }];
  });
  if (rows.length === 0) return null;

  return (
    <ul className="flex flex-col gap-0.5 text-muted-foreground">
      {rows.map(({ field, before, next }) => (
        <li key={field} className="flex flex-wrap items-baseline gap-1">
          <span>{t(`intelia:scopePause.history.field.${field}`)}:</span>
          {before !== null && (
            <>
              <span>{before}</span>
              <span aria-hidden="true">→</span>
            </>
          )}
          <span className="text-foreground/85">{next}</span>
        </li>
      ))}
    </ul>
  );
}
