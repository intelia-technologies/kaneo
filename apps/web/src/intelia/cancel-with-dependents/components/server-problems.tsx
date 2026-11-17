import { useTranslation } from "react-i18next";
import type { ProblemaResolucion } from "../contract/cancelar-con-dependientes";
import "../i18n";

/**
 * What the fork rejected in the last `409`. `falta` is left out: the footer
 * already counts what is pending.
 */
export function ServerProblems({
  problemas,
}: {
  problemas: readonly ProblemaResolucion[];
}) {
  const { t } = useTranslation();
  const p = "intelia:cancelWithDependents.problems";
  const shown = problemas.filter((x) => x.problema !== "falta");
  if (shown.length === 0) return null;
  const changed = shown.some((x) => x.problema === "cadena_cambiada");

  return (
    <section
      role="alert"
      className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm"
    >
      <h3 className="mb-1 font-medium">{t(`${p}.title`)}</h3>
      {changed && <p className="mb-1 text-xs">{t(`${p}.changed`)}</p>}
      <ul className="flex flex-col gap-0.5 text-xs">
        {shown.map((x) => (
          <li key={`${x.tarea}-${x.problema}`}>
            <span className="me-1 font-mono">{x.tarea}</span>
            {x.detalle}
          </li>
        ))}
      </ul>
    </section>
  );
}
