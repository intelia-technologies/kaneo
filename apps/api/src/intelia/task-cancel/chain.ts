import { compareTickets } from "./keys";
import type { ChainNode, Dependencia, Graph } from "./types";

const TIPO_ORDER = { decidir: 0, otro_tablero: 1 } as const;

/**
 * The chain of the root (§4.1, decisions 8, 9 and 11): every open task the
 * graph reached, once, with its relations from the root or from a task of the
 * root's board, its level (longest path from the root) and what hangs below
 * it. Ordered by level, this board first, then by key.
 */
export function buildChain(graph: Graph): ChainNode[] {
  const { root, tasks } = graph;
  const tipoOf = (id: string) =>
    tasks.get(id)!.projectId === root.projectId ? "decidir" : "otro_tablero";
  // Edges that count: from the root or from a task of its board.
  const parents = new Map<string, Dependencia[]>();
  const children = new Map<string, string[]>();
  for (const r of graph.relations) {
    if (r.target === root.id || !tasks.has(r.target)) continue;
    if (
      r.source !== root.id &&
      !(tasks.has(r.source) && tipoOf(r.source) === "decidir")
    )
      continue;
    const list = parents.get(r.target) ?? [];
    if (list.some((d) => d.taskId === r.source)) continue;
    const ticket =
      r.source === root.id ? root.ticket : tasks.get(r.source)!.ticket;
    list.push({ ticket, relacion: r.id, taskId: r.source });
    parents.set(r.target, list);
    children.set(r.source, [...(children.get(r.source) ?? []), r.target]);
  }

  const nivel = new Map<string, number>();
  const levelOf = (id: string, seen: Set<string>): number => {
    if (id === root.id) return 0;
    const known = nivel.get(id);
    if (known !== undefined) return known;
    // A cycle cannot be created through the API; cut it if old data has one.
    if (seen.has(id)) return 0;
    seen.add(id);
    const value =
      1 +
      Math.max(
        0,
        ...(parents.get(id) ?? []).map((p) => levelOf(p.taskId, seen)),
      );
    seen.delete(id);
    nivel.set(id, value);
    return value;
  };

  const below = (id: string) => {
    const seen = new Set<string>();
    const queue = [...(children.get(id) ?? [])];
    while (queue.length) {
      const next = queue.pop()!;
      if (seen.has(next) || next === id) continue;
      seen.add(next);
      queue.push(...(children.get(next) ?? []));
    }
    return seen.size;
  };

  const nodes: ChainNode[] = [];
  for (const task of tasks.values()) {
    if (task.id === root.id || !parents.has(task.id)) continue;
    const dependeDe = [...parents.get(task.id)!].sort((a, b) =>
      compareTickets(a.ticket, b.ticket),
    );
    const tipo = tipoOf(task.id);
    nodes.push({
      task,
      tipo,
      oculta: tipo === "otro_tablero" && !task.visible,
      nivel: levelOf(task.id, new Set()),
      dependeDe,
      soloSiCancelas: dependeDe.some((d) => d.taskId === root.id)
        ? []
        : dependeDe.map((d) => d.ticket),
      cuelgan: tipo === "decidir" ? below(task.id) : 0,
    });
  }
  return nodes.sort(
    (a, b) =>
      a.nivel - b.nivel ||
      TIPO_ORDER[a.tipo] - TIPO_ORDER[b.tipo] ||
      compareTickets(a.task.ticket, b.task.ticket),
  );
}

/** Same tasks, same relations, same kind: the chain did not change (decision 12). */
export function chainFingerprint(chain: readonly ChainNode[]) {
  return new Map(
    chain.map((n) => [
      n.task.ticket,
      `${n.tipo}|${n.dependeDe
        .map((d) => `${d.ticket}:${d.relacion}`)
        .sort()
        .join(",")}`,
    ]),
  );
}

/** The node as the 409 shows it (§4.2); a hidden one without key, title or owner. */
export function toPublicNode(n: ChainNode) {
  if (n.oculta) {
    return {
      tipo: "oculta" as const,
      tablero: n.task.projectSlug,
      nivel: n.nivel,
      solo_si_cancelas: n.soloSiCancelas,
    };
  }
  const base = {
    ticket: n.task.ticket,
    titulo: n.task.title,
    tablero: n.task.projectSlug,
    estado: n.task.status,
    nivel: n.nivel,
    depende_de: n.dependeDe.map(({ ticket, relacion }) => ({
      ticket,
      relacion,
    })),
  };
  if (n.tipo === "otro_tablero") {
    return {
      ...base,
      tipo: "otro_tablero" as const,
      solo_si_cancelas: n.soloSiCancelas,
      responsable: n.task.responsable,
      automatico: `Se quita la dependencia, se apaga su automática y se avisa a ${n.task.responsable ?? "su responsable"}`,
    };
  }
  return {
    ...base,
    tipo: "decidir" as const,
    solo_si_cancelas: n.soloSiCancelas,
    opciones: ["cancelar", "quitar", "mover"],
    cuelgan: n.cuelgan,
    responsable: n.task.responsable,
    asignado: n.task.assigneeName,
    automatica: n.task.automatica ?? false,
    rutina_activa: n.task.routineActive,
    en_curso: n.task.enCurso,
  };
}
