import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { DecisionState } from "../decisions";
import "../i18n";

export function DecisionToolbar({
  state,
  onCancelAll,
  onReleaseAll,
}: {
  state: DecisionState;
  onCancelAll: () => void;
  onReleaseAll: () => void;
}) {
  const { t } = useTranslation();
  const p = "intelia:cancelWithDependents";
  const counters = [
    ["cancelled", state.canceladas.size],
    ["released", state.efectos.quitadas.length],
    ["moved", state.efectos.movidas.length],
    ["otherBoards", state.efectos.otros_tableros.length],
    ["missing", state.pendientes.length],
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" onClick={onCancelAll}>
        {t(`${p}.cancelAll`)}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onReleaseAll}>
        {t(`${p}.releaseAll`)}
      </Button>
      <ul className="ms-auto flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
        {counters.map(([key, count]) => (
          <li key={key}>{t(`${p}.counters.${key}`, { count })}</li>
        ))}
      </ul>
    </div>
  );
}
