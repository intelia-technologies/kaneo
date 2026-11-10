import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { useTranslation } from "react-i18next";
import { nextSortForField } from "@/components/project/display/sort-fields";
import { cn } from "@/lib/cn";
import type { SortConfig } from "@/lib/sort-tasks";
import { ROOT_COLUMN_CLASS, WAIT_COLUMN_CLASS } from "../columns";

type WaitColumnsHeaderProps = {
  sort: SortConfig;
  onSortChange: (sort: SortConfig) => void;
};

/** Design 55 §3.2: the To do section's «Espera» and «Raíz» headers sort. */
export function WaitColumnsHeader({
  sort,
  onSortChange,
}: WaitColumnsHeaderProps) {
  const { t } = useTranslation();
  const columns = [
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
      {columns.map(({ field, label, className }) => {
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
