import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { useTranslation } from "react-i18next";
import { nextSortForField } from "@/components/project/display/sort-fields";
import { cn } from "@/lib/cn";
import type { SortConfig } from "@/lib/sort-tasks";
import {
  INITIATIVE_COLUMN_CLASS,
  ROOT_COLUMN_CLASS,
  WAIT_COLUMN_CLASS,
} from "../columns";
import "@/intelia/initiatives/i18n";

type ListColumnsHeaderProps = {
  showInitiative: boolean;
  /** The To do section's sortable «Espera» and «Raíz» (design 55 §3.2). */
  wait?: { sort: SortConfig; onSortChange: (sort: SortConfig) => void };
};

/**
 * The headers of the columns at the end of the list's rows: «Iniciativa» in
 * every section (KF-23), then «Espera» and «Raíz», which sort, in To do.
 */
export function ListColumnsHeader({
  showInitiative,
  wait,
}: ListColumnsHeaderProps) {
  const { t } = useTranslation();
  if (!showInitiative && !wait) return null;
  const sortable = [
    {
      field: "wait" as const,
      label: t("tasks:readiness.waitColumn", { defaultValue: "Espera" }),
      className: WAIT_COLUMN_CLASS,
    },
    {
      field: "root" as const,
      label: t("tasks:readiness.rootColumn", { defaultValue: "Raíz" }),
      className: ROOT_COLUMN_CLASS,
    },
  ];

  return (
    <div className="flex h-7 items-center justify-end gap-3 border-border/50 border-b pr-3.5 text-muted-foreground text-xs">
      {showInitiative && (
        <div className={INITIATIVE_COLUMN_CLASS}>
          {t("intelia:initiative.title")}
        </div>
      )}
      {wait &&
        sortable.map(({ field, label, className }) => {
          const { sort, onSortChange } = wait;
          const active = sort.field === field;
          const Arrow =
            sort.direction === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow;
          return (
            <div key={field} className={className}>
              <button
                type="button"
                onClick={() =>
                  onSortChange(
                    active
                      ? {
                          field,
                          direction: sort.direction === "asc" ? "desc" : "asc",
                        }
                      : nextSortForField(field),
                  )
                }
                aria-label={t("tasks:readiness.sortBy", {
                  column: label,
                  defaultValue: "Ordenar por {{column}}",
                })}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1 transition-colors hover:text-foreground",
                  active && "text-foreground",
                )}
              >
                {label}
                {active && <Arrow className="size-3" aria-hidden="true" />}
              </button>
            </div>
          );
        })}
    </div>
  );
}
