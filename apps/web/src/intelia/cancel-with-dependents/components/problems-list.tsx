import { useTranslation } from "react-i18next";
import type { ProblemaResolucion } from "../contract/cancelar-con-dependientes";
import "../i18n";

/**
 * Decisions that do not hold: the ones the fork rejected in the last `409`
 * (`source: "server"`) or the ones the contract already rejects here, such as
 * a `mover` that would create a cycle (`source: "local"`). `falta` is left
 * out: the footer already counts what is pending.
 */
export function ProblemsList({
  problemas,
  source,
}: {
  problemas: readonly ProblemaResolucion[];
  source: "server" | "local";
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
      <h3 className="mb-1 font-medium">{t(`${p}.${source}Title`)}</h3>
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
