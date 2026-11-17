import { chainFingerprint } from "./chain";
import {
  ACCIONES,
  type Accion,
  type Aplicacion,
  type ChainNode,
  type EfectoMover,
  type Efectos,
  type Problema,
  type RawResolution,
  type TargetInfo,
} from "./types";

export type ResolveContext = {
  root: string;
  /** Ids or keys of the batch (decision 18): they count as `cancelar`. */
  lote?: ReadonlySet<string>;
  /** The chain the resolutions were checked against, before the lock. */
  previous?: readonly ChainNode[];
  /** Each `mover` target by key; null if it does not exist or is not readable. */
  targets?: ReadonlyMap<string, TargetInfo>;
  /** `blocks` relations by key around the `mover` tasks, to find cycles outside the chain. */
  edges?: readonly { id: string; source: string; target: string }[];
};

const isAccion = (v: unknown): v is Accion =>
  typeof v === "string" && (ACCIONES as readonly string[]).includes(v);

/**
 * The fork's `aplicarResoluciones` (contract of CD-01, §4.8), over the chain it
 * computed: what is still to decide, what is wrong and what would happen. It
 * passes the same samples; problems keep the contract's order and texts.
 */
export function applyResolutions(
  chain: readonly ChainNode[],
  resoluciones: readonly RawResolution[],
  ctx: ResolveContext,
): Aplicacion {
  const problemas: Problema[] = [];
  const problema = (tarea: string, codigo: string, detalle: string) =>
    problemas.push({ tarea, problema: codigo, detalle });
  const byTicket = new Map(chain.map((n) => [n.task.ticket, n]));

  if (ctx.previous) {
    const before = chainFingerprint(ctx.previous);
    const now = chainFingerprint(chain);
    const hidden = new Set(
      [...ctx.previous, ...chain]
        .filter((n) => n.oculta)
        .map((n) => n.task.ticket),
    );
    for (const k of new Set([...before.keys(), ...now.keys()])) {
      if (before.get(k) === now.get(k)) continue;
      const detalle = !before.has(k)
        ? "Ha entrado en la cadena después de que la vieras."
        : !now.has(k)
          ? "Ya no está en la cadena."
          : "Han cambiado sus dependencias dentro de la cadena.";
      problema(hidden.has(k) ? ctx.root : k, "cadena_cambiada", detalle);
    }
  }

  const porTarea = new Map<string, RawResolution>();
  for (const r of resoluciones) {
    if (porTarea.has(r.tarea)) {
      problema(
        r.tarea,
        "sobra",
        "Resolución repetida: cada tarea lleva una sola.",
      );
      continue;
    }
    porTarea.set(r.tarea, r);
  }
  // A task of the batch that comes without a resolution is cancelled with it.
  const inLote = (n: ChainNode) =>
    !!ctx.lote && (ctx.lote.has(n.task.id) || ctx.lote.has(n.task.ticket));
  const resolutionOf = (n: ChainNode): RawResolution | undefined =>
    porTarea.get(n.task.ticket) ??
    (n.tipo === "decidir" && inLote(n)
      ? { tarea: n.task.ticket, accion: "cancelar" }
      : undefined);
  const accionOf = (n: ChainNode) => {
    const accion = resolutionOf(n)?.accion;
    return isAccion(accion) ? accion : undefined;
  };

  // In play: a node enters if it hangs from the root or from a task cancelled.
  const canceladas = new Set([ctx.root]);
  const enJuego = new Set<ChainNode>();
  for (let changed = true; changed;) {
    changed = false;
    for (const n of chain) {
      if (enJuego.has(n)) continue;
      if (
        n.soloSiCancelas.length &&
        !n.soloSiCancelas.some((t) => canceladas.has(t))
      )
        continue;
      enJuego.add(n);
      changed = true;
      if (n.tipo === "decidir" && accionOf(n) === "cancelar")
        canceladas.add(n.task.ticket);
    }
  }

  const pendientes = new Set<ChainNode>();
  const efectos: Efectos = {
    enCascada: [],
    quitadas: [],
    movidas: [],
    otrosTableros: [],
  };
  const hayResoluciones = resoluciones.length > 0;
  for (const n of chain) {
    if (!enJuego.has(n)) continue;
    const cortadas = n.dependeDe.filter((d) => canceladas.has(d.ticket));
    const efecto = {
      node: n,
      de: cortadas.map((d) => d.ticket),
      relaciones: cortadas.map((d) => d.relacion),
    };
    if (n.tipo === "otro_tablero") {
      efectos.otrosTableros.push(efecto);
      continue;
    }
    const r = resolutionOf(n);
    const accion = accionOf(n);
    if (r === undefined) {
      pendientes.add(n);
      if (hayResoluciones)
        problema(
          n.task.ticket,
          "falta",
          "Está en juego y no tiene resolución: elige cancelar, quitar o mover.",
        );
    } else if (accion === undefined) {
      pendientes.add(n);
      problema(
        n.task.ticket,
        "accion_desconocida",
        `La acción tiene que ser cancelar, quitar o mover; llegó ${JSON.stringify(r.accion)}.`,
      );
    } else if (accion === "cancelar") {
      efectos.enCascada.push(n);
    } else if (accion === "quitar") {
      efectos.quitadas.push(efecto);
    } else if (typeof r.a !== "string" || r.a.length === 0) {
      pendientes.add(n);
      problema(
        n.task.ticket,
        "falta_a",
        "`mover` necesita `a`: la clave de la tarea a la que pasa la dependencia.",
      );
    } else {
      efectos.movidas.push({ ...efecto, a: r.a });
    }
  }

  for (const [tarea] of porTarea) {
    const n = byTicket.get(tarea);
    if (n === undefined || n.oculta)
      problema(tarea, "sobra", "No está en la cadena de esta cancelación.");
    else if (n.tipo === "otro_tablero")
      problema(
        tarea,
        "sobra",
        "Es de otro tablero: no se decide, se trata sola.",
      );
    else if (!enJuego.has(n))
      problema(
        tarea,
        "sobra",
        `No entra en juego: no se cancela ninguna de ${n.soloSiCancelas.join(", ")}.`,
      );
  }

  // A hidden task is not a target the caller can name: it does not exist for
  // them (decision 15), and no problem text may confirm it.
  const visibles = new Map([...byTicket].filter(([, n]) => !n.oculta));
  const deMover = moverProblems(efectos, visibles, canceladas, ctx);
  problemas.push(...deMover);
  const invalid = new Set(deMover.map((p) => p.tarea));
  efectos.movidas = efectos.movidas.filter(
    (m) => !invalid.has(m.node.task.ticket),
  );
  return {
    pendientes: chain.filter(
      (n) =>
        n.tipo === "decidir" &&
        (pendientes.has(n) || invalid.has(n.task.ticket)),
    ),
    problemas,
    efectos,
  };
}

function moverProblems(
  efectos: Efectos,
  byTicket: ReadonlyMap<string, ChainNode>,
  canceladas: ReadonlySet<string>,
  ctx: ResolveContext,
): Problema[] {
  const problemas: Problema[] = [];
  const valid: EfectoMover[] = [];
  for (const m of efectos.movidas) {
    const tarea = m.node.task.ticket;
    const target = ctx.targets?.get(m.a);
    if (m.a === tarea)
      problemas.push({
        tarea,
        problema: "a_es_ella_misma",
        detalle: "Una tarea no puede depender de sí misma.",
      });
    else if (canceladas.has(m.a))
      problemas.push({
        tarea,
        problema: "a_se_cancela",
        detalle: `${m.a} se cancela en esta operación.`,
      });
    else if (
      target &&
      (target.status === "cancelled" || target.status === "canceled")
    )
      problemas.push({
        tarea,
        problema: "a_cancelada",
        detalle: `${m.a} ya está cancelada.`,
      });
    else if (ctx.targets && !target && !byTicket.has(m.a))
      problemas.push({
        tarea,
        problema: "a_no_existe",
        detalle: `${m.a} no existe.`,
      });
    else valid.push(m);
  }
  if (!valid.length) return problemas;

  // The graph once applied: chain and outside relations, without the ones
  // removed, with the new ones from each `a`.
  const removed = new Set(
    [...efectos.quitadas, ...efectos.movidas, ...efectos.otrosTableros].flatMap(
      (e) => e.relaciones,
    ),
  );
  const children = new Map<string, Set<string>>();
  const link = (source: string, target: string) => {
    const set = children.get(source) ?? new Set<string>();
    set.add(target);
    children.set(source, set);
  };
  for (const n of byTicket.values())
    for (const d of n.dependeDe)
      if (!removed.has(d.relacion)) link(d.ticket, n.task.ticket);
  for (const e of ctx.edges ?? [])
    if (!removed.has(e.id)) link(e.source, e.target);
  for (const m of valid) link(m.a, m.node.task.ticket);

  for (const m of valid) {
    const tarea = m.node.task.ticket;
    const seen = new Set([tarea]);
    const queue = [tarea];
    while (queue.length && !seen.has(m.a)) {
      for (const next of children.get(queue.shift()!) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    if (seen.has(m.a))
      problemas.push({
        tarea,
        problema: "ciclo",
        detalle: `${m.a} ya depende de ${tarea}: moverla crearía un ciclo.`,
      });
  }
  return problemas;
}
