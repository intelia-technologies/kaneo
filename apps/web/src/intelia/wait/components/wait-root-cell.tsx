import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { WaitRoot } from "@/types/task/blockers-summary";
import { ROOT_COLUMN_CLASS } from "../columns";
import { blockerLine, rootLabel } from "../labels";

/** Design 55 §3.2: the «Raíz» column of the list. */
export function WaitRootCell({ root }: { root: WaitRoot | null }) {
  const { t } = useTranslation();
  const label = root ? rootLabel(t, root) : "";
  return (
    <span
      className={cn(
        ROOT_COLUMN_CLASS,
        "truncate font-mono text-muted-foreground text-xs",
      )}
      title={root?.task ? blockerLine(t, root.task) : label || undefined}
    >
      <span className="sr-only">
        {t("tasks:readiness.rootColumn", { defaultValue: "Raíz" })}:{" "}
      </span>
      {label || "—"}
    </span>
  );
}
