import { toPublicNode } from "./chain";
import type { Aplicacion, ChainNode, GraphTask } from "./types";

/** At most this many nodes in `cadena`; with more, `truncada` (§4.2). */
export const MAX_NODOS_CADENA = 200;

const OPCIONES = {
  cancelar:
    "La cancela también, con el mismo motivo. Después hay que resolver lo que cuelga de ella (sus nodos con solo_si_cancelas).",
  quitar:
    "Le quita la dependencia; sigue viva y lo que cuelga de ella no se toca.",
  mover:
    "Su dependencia pasa a la tarea `a` (por ejemplo, la tarea en la que se partió esta). Lo que cuelga de ella no se toca.",
};

const OTROS_TABLEROS =
  "No se deciden: al cancelar se les quita la dependencia, se les apaga la automática y se avisa a su responsable.";

export type DependenciesError = ReturnType<typeof dependenciesErrorBody>;

/**
 * `409 DEPENDENCIAS_SIN_RESOLVER` (§4.2) for the chain as it is now and what
 * the resolutions left. Nothing is preselected in `ejemplo_resoluciones`.
 */
export function dependenciesErrorBody({
  root,
  chain,
  aplicacion,
  motivoRecibido,
  conResoluciones,
}: {
  root: GraphTask;
  chain: readonly ChainNode[];
  aplicacion: Aplicacion;
  motivoRecibido: boolean;
  conResoluciones: boolean;
}) {
  const { pendientes, problemas } = aplicacion;
  const otros = chain.filter((n) => n.tipo === "otro_tablero").length;
  const message = !conResoluciones
    ? `${root.ticket} tiene ${chain.length} tareas abiertas que pueden verse afectadas (${chain.length - otros} de este tablero, ${otros} de otro). Para cancelarla, di qué pasa con cada una de las pendientes con \`resoluciones\` y escribe un \`motivo\`.`
    : problemas.length || pendientes.length
      ? `No se ha cancelado nada: las resoluciones tienen ${problemas.length} problemas y quedan ${pendientes.length} tareas por decidir. Corrígelas y vuelve a llamar con la lista entera.`
      : "No se ha cancelado nada: falta el `motivo` (de 10 a 1000 caracteres). Vuelve a llamar con él y las mismas resoluciones.";
  return {
    error: "DEPENDENCIAS_SIN_RESOLVER" as const,
    message,
    details: {
      tarea: {
        ticket: root.ticket,
        titulo: root.title,
        tablero: root.projectSlug,
      },
      motivo: { requerido: true, recibido: motivoRecibido },
      total: chain.length,
      truncada: chain.length > MAX_NODOS_CADENA,
      cadena: chain.slice(0, MAX_NODOS_CADENA).map(toPublicNode),
      pendientes: pendientes.map((n) => n.task.ticket),
      problemas,
      opciones: OPCIONES,
      otros_tableros: OTROS_TABLEROS,
      ejemplo_resoluciones: pendientes.map((n, i) => ({
        tarea: n.task.ticket,
        accion: "elige: cancelar | quitar | mover",
        // The hint for `a` only on the first call, once.
        ...(i === 0 && !conResoluciones
          ? { a: "solo con mover: clave de la tarea" }
          : {}),
      })),
      a_mano: `También puedes resolverlo en varias llamadas: kaneo.remove_dependency {relationId} para quitar; remove_dependency y kaneo.add_dependency {taskId, dependsOnTaskId: a} para mover; y cancelar de abajo arriba. Después cancela ${root.ticket}.`,
    },
  };
}
