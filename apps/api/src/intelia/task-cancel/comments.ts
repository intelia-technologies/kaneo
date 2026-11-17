import { parseTicket } from "./keys";
import type { ChainNode, EfectoMover, Efectos, GraphTask } from "./types";

export type CancelComment = { taskId: string; content: string };

// §4.6 wrote «…: la rutina la reabrirá en su próximo tick» (today's
// behaviour, §9 question 3); decision 23 settled that question by pausing it,
// so the sentence keeps its start and says what now happens.
const ROUTINE_PAUSED =
  " Esta tarea tiene una rutina activa: queda en pausa (active = false), así que la rutina no la reabrirá en su próximo tick.";

/**
 * One comment per task touched (§4.6), signed by whoever cancels: the root,
 * each one cancelled in cascade, each one released or moved, and each one of
 * another board, whose owner is named so they review it. The comments on the
 * root's board name tasks of other boards by board only: anyone reading that
 * board reads them, whatever the canceller reads.
 */
export function cancelComments({
  quien,
  motivo,
  root,
  efectos,
  automaticaApagada,
}: {
  quien: string;
  motivo: string;
  root: GraphTask;
  efectos: Efectos;
  /** Tasks of another board whose automation this cancellation turned off. */
  automaticaApagada: ReadonlySet<string>;
}): CancelComment[] {
  const m = `Motivo: «${motivo}».`;
  const list = (nodes: ChainNode[]) =>
    nodes.map((n) => n.task.ticket).join(", ");
  // A key of this board as is; one of another board, by its board only.
  const here = (ticket: string) => {
    const slug = parseTicket(ticket)?.slug;
    return slug === root.projectSlug ? ticket : `una tarea de ${slug}`;
  };
  const mover = (e: EfectoMover) =>
    `${e.node.task.ticket} (de ${e.de.join(", ")} a ${here(e.a)})`;
  const perBoard = new Map<string, number>();
  for (const e of efectos.otrosTableros)
    perBoard.set(
      e.node.task.projectSlug,
      (perBoard.get(e.node.task.projectSlug) ?? 0) + 1,
    );
  const otros = [...perBoard]
    .map(([slug, n]) => `${n} ${n === 1 ? "tarea" : "tareas"} de ${slug}`)
    .join(", ");
  const sections = [
    efectos.enCascada.length &&
      `se cancelan también: ${list(efectos.enCascada)}`,
    efectos.quitadas.length &&
      `se quita la dependencia a: ${list(efectos.quitadas.map((e) => e.node))}`,
    efectos.movidas.length &&
      `se mueve a otra tarea: ${efectos.movidas.map(mover).join(", ")}`,
    efectos.otrosTableros.length && `otros tableros, automático: ${otros}`,
  ]
    .filter(Boolean)
    .join("; ");
  const rutina = (task: GraphTask) =>
    task.routineActive ? ROUTINE_PAUSED : "";

  const comments: CancelComment[] = [
    {
      taskId: root.id,
      content:
        `Cancelada por ${quien}. ${m}` +
        (sections
          ? ` ${sections[0]!.toUpperCase()}${sections.slice(1)}.`
          : "") +
        rutina(root),
    },
  ];
  for (const n of efectos.enCascada) {
    const de = n.dependeDe.filter(
      (d) =>
        d.ticket === root.ticket ||
        efectos.enCascada.some((c) => c.task.ticket === d.ticket),
    );
    comments.push({
      taskId: n.task.id,
      content:
        `Cancelada en cascada: ${quien} canceló ${root.ticket} y eligió cancelar también esta tarea (dependía de ${de.map((d) => d.ticket).join(", ")}). ${m}` +
        rutina(n.task),
    });
  }
  // «<quién> canceló <raíz>[ y, en cascada, <X>]» for the ones that stay.
  const cancelo = (de: string[]) => {
    const cascada = de.filter((t) => t !== root.ticket);
    return `${quien} canceló ${root.ticket}${cascada.length ? ` y, en cascada, ${cascada.join(", ")}` : ""}. ${m}`;
  };
  for (const e of efectos.quitadas) {
    comments.push({
      taskId: e.node.task.id,
      content: `${cancelo(e.de)} Decisión: se quita la dependencia de ${e.de.join(", ")}; esta tarea sigue viva.`,
    });
  }
  for (const e of efectos.movidas) {
    comments.push({
      taskId: e.node.task.id,
      content: `${cancelo(e.de)} Decisión: la dependencia pasa de ${e.de.join(", ")} a ${here(e.a)}.`,
    });
  }
  for (const e of efectos.otrosTableros) {
    const apagada = automaticaApagada.has(e.node.task.id)
      ? "Se ha quitado la dependencia y se ha apagado la automática de esta tarea por si acaso."
      : "Se ha quitado la dependencia; la automática de esta tarea ya estaba apagada.";
    const owner = e.node.task.responsable;
    comments.push({
      taskId: e.node.task.id,
      content: `${quien} canceló ${e.de.join(", ")} (tablero ${root.projectSlug}). ${m} ${apagada} ${owner ? `@${owner}, revisa` : "Revisa"} si debe seguir adelante.`,
    });
  }
  return comments;
}

/** `pausa_motivo` of a task of another board (§4.3). */
export const pauseReason = (de: string[], motivo: string) =>
  `Dependencia cancelada: ${de.join(", ")} (${motivo})`;
