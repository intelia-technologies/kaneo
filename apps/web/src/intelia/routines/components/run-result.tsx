import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { RoutineRun } from "../api";

const RESULT_CLASS: Record<RoutineRun["result"], string> = {
  reabierta: "text-success-foreground",
  saltada_abierta: "text-warning-foreground",
  error: "text-destructive",
};

export function RunResult({ result }: { result: RoutineRun["result"] }) {
  const { t } = useTranslation();
  return (
    <span className={cn("shrink-0 font-medium", RESULT_CLASS[result])}>
      {t(`intelia:routines.result.${result}`)}
    </span>
  );
}
