import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import "../i18n";

const ITEMS = [
  ["root", "border-2 border-red-600 bg-red-600/15"],
  ["cancel", "border-red-500 bg-red-500/10"],
  ["release", "border-green-600 bg-green-600/10"],
  ["move", "border-blue-500 bg-blue-500/10"],
  ["otherBoard", "border-amber-500 bg-amber-500/10"],
  ["undecided", "border-dashed border-muted-foreground/70"],
  ["untouched", "border-muted-foreground/40 opacity-40"],
] as const;

export function GraphLegend() {
  const { t } = useTranslation();
  const p = "intelia:cancelWithDependents.legend";
  return (
    <ul
      aria-label={t(`${p}.title`)}
      className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs"
    >
      {ITEMS.map(([key, swatch]) => (
        <li key={key} className="flex items-center gap-1">
          <span
            aria-hidden
            className={cn("size-3 rounded-sm border", swatch)}
          />
          {t(`${p}.${key}`)}
        </li>
      ))}
    </ul>
  );
}
