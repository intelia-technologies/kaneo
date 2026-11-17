import { useTranslation } from "react-i18next";
import type { EfectoOtroTablero } from "../contract/cancelar-con-dependientes";
import "../i18n";

/** The amber box: tasks of other boards touched automatically (decision 3). */
export function OtherBoardsNotice({
  effects,
}: {
  effects: readonly EfectoOtroTablero[];
}) {
  const { t } = useTranslation();
  const p = "intelia:cancelWithDependents.otherBoards";
  if (effects.length === 0) return null;

  return (
    <section
      aria-label={t(`${p}.title`)}
      className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm"
    >
      <h3 className="mb-1 font-medium">{t(`${p}.title`)}</h3>
      <ul className="flex flex-col gap-0.5 text-xs">
        {effects.map((effect, index) =>
          "oculta" in effect ? (
            // Hidden tasks have no key: their position is their identity.
            // oxlint-disable-next-line react/no-array-index-key
            <li key={`oculta-${index}`}>
              {t(`${p}.hidden`, { board: effect.tablero })}
            </li>
          ) : (
            <li key={effect.tarea}>
              {effect.responsable
                ? t(`${p}.item`, {
                    ticket: effect.tarea,
                    owner: effect.responsable,
                  })
                : t(`${p}.itemNoOwner`, { ticket: effect.tarea })}
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
