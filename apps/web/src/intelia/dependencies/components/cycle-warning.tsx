import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

export function CycleWarning({ taskNames }: { taskNames: string[] }) {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="mx-4 my-2 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200"
    >
      <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-amber-800 dark:text-amber-300 break-words">
          {t("intelia:dependencies.cycleWarning", {
            tasks: taskNames.join(" → "),
          })}
        </p>
      </div>
    </div>
  );
}
