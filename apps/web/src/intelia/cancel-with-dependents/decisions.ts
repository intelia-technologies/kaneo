import {
  aplicarResoluciones,
  type AccionResolucion,
  type EfectosResoluciones,
  type ErrorDependenciasSinResolver,
  type NodoCadena,
  type NodoDecidir,
  type ProblemaResolucion,
  type Resolucion,
} from "./contract/cancelar-con-dependientes";

export type Decision = { accion: AccionResolucion; a?: string };
export type Decisions = Readonly<Record<string, Decision>>;
export type ChainDetails = ErrorDependenciasSinResolver["details"];

export type DecisionState = {
  raiz: string;
  /** The root and every task cancelled in cascade. */
  canceladas: ReadonlySet<string>;
  pendientes: string[];
  problemas: ProblemaResolucion[];
  efectos: EfectosResoluciones;
  /** Only the decisions on nodes in play: what `/cancel` receives. */
  resoluciones: Resolucion[];
};

export const isDecidir = (n: NodoCadena): n is NodoDecidir =>
  n.tipo === "decidir";

/** A node is in play when it hangs from the root or from a cancelled task. */
export function isInPlay(
  node: NodoCadena,
  canceladas: ReadonlySet<string>,
): boolean {
  return (
    node.solo_si_cancelas.length === 0 ||
    node.solo_si_cancelas.some((t) => canceladas.has(t))
  );
}

function toResoluciones(
  cadena: readonly NodoCadena[],
  decisions: Decisions,
  keep: (node: NodoDecidir) => boolean,
): Resolucion[] {
  const out: Resolucion[] = [];
  for (const node of cadena) {
    if (!isDecidir(node) || !keep(node)) continue;
    const decision = decisions[node.ticket];
    if (!decision) continue;
    out.push(
      decision.accion === "mover" && decision.a
        ? { tarea: node.ticket, accion: "mover", a: decision.a }
        : { tarea: node.ticket, accion: decision.accion },
    );
  }
  return out;
}

/**
 * Runs the contract's `aplicarResoluciones` over the panel's decisions.
 * Decisions on nodes that left play (a parent was released) stay in the
 * panel, so they come back if the parent is cancelled again, but are not
 * sent: the fork would reject them as `sobra`.
 */
export function evaluateDecisions(
  details: ChainDetails,
  decisions: Decisions,
): DecisionState {
  const raiz = details.tarea.ticket;
  const all = toResoluciones(details.cadena, decisions, () => true);
  const first = aplicarResoluciones(details.cadena, all, { raiz });
  const canceladas = new Set([raiz, ...first.efectos.en_cascada]);
  const resoluciones = toResoluciones(details.cadena, decisions, (node) =>
    isInPlay(node, canceladas),
  );
  const applied = aplicarResoluciones(details.cadena, resoluciones, { raiz });
  return {
    raiz,
    canceladas,
    pendientes: applied.pendientes,
    problemas: applied.problemas,
    efectos: applied.efectos,
    resoluciones,
  };
}

/** The node and every task of this board that hangs from it, transitively. */
export function branchOf(
  cadena: readonly NodoCadena[],
  ticket: string,
): string[] {
  const children = new Map<string, string[]>();
  for (const node of cadena) {
    if (!isDecidir(node)) continue;
    for (const dep of node.depende_de) {
      const list = children.get(dep.ticket) ?? [];
      list.push(node.ticket);
      children.set(dep.ticket, list);
    }
  }
  const seen = new Set([ticket]);
  const queue = [ticket];
  while (queue.length > 0) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return cadena
    .filter((n): n is NodoDecidir => isDecidir(n) && seen.has(n.ticket))
    .map((n) => n.ticket);
}

export function withDecision(
  decisions: Decisions,
  ticket: string,
  decision: Decision,
): Decisions {
  return { ...decisions, [ticket]: decision };
}

export function cancelBranch(
  decisions: Decisions,
  cadena: readonly NodoCadena[],
  ticket: string,
): Decisions {
  const next = { ...decisions };
  for (const t of branchOf(cadena, ticket)) next[t] = { accion: "cancelar" };
  return next;
}

export function cancelAll(cadena: readonly NodoCadena[]): Decisions {
  const next: Record<string, Decision> = {};
  for (const node of cadena) {
    if (isDecidir(node)) next[node.ticket] = { accion: "cancelar" };
  }
  return next;
}

/** Releases every direct dependent; what hangs below leaves play. */
export function releaseAll(
  decisions: Decisions,
  cadena: readonly NodoCadena[],
): Decisions {
  const next = { ...decisions };
  for (const node of cadena) {
    if (isDecidir(node) && node.solo_si_cancelas.length === 0) {
      next[node.ticket] = { accion: "quitar" };
    }
  }
  return next;
}

// A decision the fork flagged with one of these no longer holds.
const INVALIDATING: Record<string, true> = {
  accion_desconocida: true,
  falta_a: true,
  a_no_existe: true,
  a_se_cancela: true,
  a_cancelada: true,
  a_es_ella_misma: true,
  ciclo: true,
};

export type Reconciled = {
  decisions: Decisions;
  /** Tickets that entered the chain or whose dependencies changed. */
  changed: ReadonlySet<string>;
};

/**
 * After a `409` with a new chain: keeps every decision that still applies to
 * a decidable node of the new chain and that the fork did not reject.
 */
export function reconcileDecisions(
  decisions: Decisions,
  previous: readonly NodoCadena[],
  next: ChainDetails,
): Reconciled {
  const rejected = new Set(
    next.problemas.filter((p) => INVALIDATING[p.problema]).map((p) => p.tarea),
  );
  const nodes = new Map(
    next.cadena.filter(isDecidir).map((n) => [n.ticket, n]),
  );
  const kept: Record<string, Decision> = {};
  for (const [ticket, decision] of Object.entries(decisions)) {
    const node = nodes.get(ticket);
    if (!node || rejected.has(ticket)) continue;
    if (!node.opciones.includes(decision.accion)) continue;
    kept[ticket] = decision;
  }

  const before = new Set(
    previous.flatMap((n) => (n.tipo === "oculta" ? [] : [n.ticket])),
  );
  const changed = new Set<string>();
  for (const node of next.cadena) {
    if (node.tipo !== "oculta" && !before.has(node.ticket)) {
      changed.add(node.ticket);
    }
  }
  for (const p of next.problemas) {
    if (p.problema === "cadena_cambiada") changed.add(p.tarea);
  }
  return { decisions: kept, changed };
}
