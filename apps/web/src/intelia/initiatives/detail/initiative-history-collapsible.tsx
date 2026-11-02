import { ChevronDownIcon, HistoryIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  formatDateMedium,
  formatDateTime,
  formatRelativeTime,
} from "@/lib/format";
import type { InitiativeChange } from "../api";
import { useInitiativeHistory } from "../api";

type InitiativeHistoryCollapsibleProps = {
  projectId: string;
  initiativeId: string;
};

const FIELD_LABELS: Record<string, string> = {
  name: "intelia:initiatives.detail.field.name",
  designUrl: "intelia:initiatives.detail.field.designUrl",
  approvedBy: "intelia:initiatives.detail.field.approvedBy",
  approvedAt: "intelia:initiatives.detail.field.approvedAt",
};

export function InitiativeHistoryCollapsible({
  projectId,
  initiativeId,
}: InitiativeHistoryCollapsibleProps) {
  const { t } = useTranslation();
  const { data: history = [], isLoading } = useInitiativeHistory(
    projectId,
    initiativeId,
  );
  const [open, setOpen] = useState(false);

  const formatValue = (key: string, val: unknown): string => {
    if (val === null || val === undefined || val === "") {
      return t("intelia:initiatives.detail.editDialog.emptyValue");
    }
    if (key === "approvedAt" && typeof val === "string") {
      try {
        const d = new Date(val);
        if (!Number.isNaN(d.getTime())) {
          return formatDateMedium(d);
        }
      } catch {
        // fallback to string
      }
    }
    return String(val);
  };

  const renderFieldDiff = (change: InitiativeChange) => {
    if (change.kind !== "updated") return null;

    const previous = change.previous ?? {};
    const value = change.value ?? {};
    const changedKeys = Object.keys(value).filter((key) =>
      Object.hasOwn(FIELD_LABELS, key),
    );

    if (changedKeys.length === 0) return null;

    return (
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {changedKeys.map((key) => {
          const prevVal = formatValue(key, previous[key]);
          const nextVal = formatValue(key, value[key]);
          const labelKey = FIELD_LABELS[key];
          const label = labelKey ? t(labelKey) : key;

          return (
            <li key={key} className="flex flex-wrap items-baseline gap-1">
              <span className="font-medium text-foreground">{label}:</span>
              <span>{prevVal}</span>
              <span aria-hidden="true">→</span>
              <span className="font-medium text-foreground">{nextVal}</span>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border border-border bg-card p-3"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-sm font-medium hover:text-foreground">
        <span className="flex items-center gap-2">
          <HistoryIcon className="size-4 text-muted-foreground" />
          <span>{t("intelia:initiatives.detail.historyTitle")}</span>
          {history.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground font-normal">
              {t("intelia:initiatives.detail.changesCount", {
                count: history.length,
              })}
            </span>
          )}
        </span>
        <ChevronDownIcon
          className={`size-4 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </CollapsibleTrigger>

      <CollapsiblePanel className="pt-3">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">
            {t("intelia:initiatives.loading")}
          </p>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("intelia:initiatives.detail.noHistory")}
          </p>
        ) : (
          <ol className="relative space-y-3 border-l border-border pl-4">
            {history.map((change) => {
              const who = change.changedByName || change.changedByActor || "—";
              const when = formatRelativeTime(change.changedAt);
              const fullTime = formatDateTime(change.changedAt);
              const kindLabel = t(
                `intelia:initiatives.detail.kind.${change.kind}`,
                { defaultValue: change.kind },
              );

              return (
                <li key={change.id} className="relative text-xs">
                  <div className="absolute -left-[21px] top-1 size-2 rounded-full bg-primary" />
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-foreground">
                      {kindLabel}
                    </span>
                    <span className="text-muted-foreground">
                      {t("intelia:initiatives.detail.changedBy", {
                        name: who,
                      })}
                    </span>
                    <time
                      dateTime={change.changedAt}
                      title={fullTime}
                      className="text-muted-foreground/75"
                    >
                      {when}
                    </time>
                  </div>
                  {renderFieldDiff(change)}
                </li>
              );
            })}
          </ol>
        )}
      </CollapsiblePanel>
    </Collapsible>
  );
}
