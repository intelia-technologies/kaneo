import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import useGlobalSearch from "@/hooks/queries/search/use-global-search";
import "../i18n";

const MIN_CHARS = 2;
const FINAL_STATUSES: Record<string, true> = { done: true, cancelled: true };

/**
 * Search for the task a `mover` points to. Excludes final tasks and the ones
 * this operation cancels; the fork checks the rest (existence, cycles).
 */
export function MoveTargetSearch({
  workspaceId,
  excluded,
  onPick,
}: {
  workspaceId: string;
  excluded: ReadonlySet<string>;
  onPick: (ticket: string, title: string) => void;
}) {
  const { t } = useTranslation();
  const p = "intelia:cancelWithDependents.search";
  const inputId = useId();
  const [query, setQuery] = useState("");
  const q = query.trim();
  const { data, isFetching } = useGlobalSearch({
    q: q.length >= MIN_CHARS ? q : "",
    type: "tasks",
    workspaceId,
    limit: 15,
  });

  const results = (data?.results ?? []).flatMap((r) => {
    if (r.type !== "task" || !r.projectSlug || r.taskNumber === undefined) {
      return [];
    }
    if (r.archivedAt || (r.status && FINAL_STATUSES[r.status])) return [];
    const ticket = `${r.projectSlug}-${r.taskNumber}`;
    if (excluded.has(ticket)) return [];
    return [{ id: r.id, ticket, title: r.title, project: r.projectName }];
  });

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-xs font-medium">
        {t(`${p}.label`)}
      </label>
      <Input
        id={inputId}
        autoFocus
        value={query}
        placeholder={t(`${p}.placeholder`)}
        onChange={(e) => setQuery(e.target.value)}
      />
      {q.length < MIN_CHARS ? (
        <p className="text-muted-foreground text-xs">
          {t(`${p}.minChars`, { min: MIN_CHARS })}
        </p>
      ) : isFetching && results.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t(`${p}.loading`)}</p>
      ) : results.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t(`${p}.empty`)}</p>
      ) : (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent"
                onClick={() => onPick(r.ticket, r.title)}
              >
                <span className="font-mono text-xs">{r.ticket}</span>
                <span className="truncate">{r.title}</span>
                {r.project && (
                  <span className="ms-auto shrink-0 text-muted-foreground text-xs">
                    {r.project}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
