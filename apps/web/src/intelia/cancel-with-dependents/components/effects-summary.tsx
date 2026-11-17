import { useTranslation } from "react-i18next";
import type { DecisionState } from "../decisions";
import "../i18n";

/** «Qué va a pasar», grouped by effect, as in option D of the mockup. */
export function EffectsSummary({ state }: { state: DecisionState }) {
  const { t } = useTranslation();
  const p = "intelia:cancelWithDependents.summary";
  const { efectos } = state;
  const otherBoards = efectos.otros_tableros.map((e) =>
    "oculta" in e ? e.tablero : e.tarea,
  );
  const groups = [
    { key: "cancelled", items: [...state.canceladas] },
    { key: "released", items: efectos.quitadas.map((q) => q.tarea) },
    {
      key: "moved",
      items: efectos.movidas.map((m) =>
        t(`${p}.movedItem`, {
          ticket: m.tarea,
          from: m.de.join(", "),
          to: m.a,
        }),
      ),
    },
    { key: "otherBoards", items: otherBoards },
  ].filter((g) => g.items.length > 0);

  return (
    <section aria-label={t(`${p}.title`)} className="flex flex-col gap-2">
      <h3 className="font-medium text-sm">{t(`${p}.title`)}</h3>
      <dl className="flex flex-col gap-1.5 text-xs">
        {groups.map((group) => (
          <div key={group.key}>
            <dt className="text-muted-foreground">{t(`${p}.${group.key}`)}</dt>
            <dd>{group.items.join(" · ")}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground text-xs">{t(`${p}.comments`)}</p>
    </section>
  );
}
