import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type Task from "@/types/task";
import { buildGraphModel } from "../dependencies/graph-model";
import type { ProjectRelation } from "../dependencies/types";
import type { NodoCadena } from "./contract/cancelar-con-dependientes";
import {
  isInPlay,
  type ChainDetails,
  type DecisionState,
  type Decisions,
} from "./decisions";

// buildGraphModel lays project tasks out as 220×80 boxes; the chain nodes
// render at that size so dagre's spacing holds.
export const CHAIN_NODE_WIDTH = 220;
export const CHAIN_NODE_HEIGHT = 80;

export type ChainNodeKind =
  | "raiz"
  | "cancelar"
  | "quitar"
  | "mover"
  | "pendiente"
  | "otro_tablero"
  | "oculta"
  | "destino";

export type ChainNodeData = {
  kind: ChainNodeKind;
  /** `null` for hidden nodes: the reader cannot see that project. */
  ticket: string | null;
  titulo: string | null;
  tablero: string;
  responsable: string | null;
  asignado: string | null;
  /** Hangs from nothing that is cancelled: untouched. */
  dimmed: boolean;
  clickable: boolean;
  selected: boolean;
  /** Entered the chain, or changed, since the panel last saw it. */
  changed: boolean;
  cuelgan: number;
  enCurso: boolean;
  /** The root and its direct dependents: the view opens on them. */
  focus: boolean;
  onSelect?: (ticket: string) => void;
};

export type ChainEdgeKind =
  | "cancela"
  | "cortada"
  | "movida"
  | "otro_tablero"
  | "pendiente"
  | "atenuada";

export type ChainEdgeData = { kind: ChainEdgeKind };

export type ChainGraph = {
  nodes: Node<ChainNodeData>[];
  edges: Edge<ChainEdgeData>[];
};

export type BuildChainGraphOptions = {
  details: ChainDetails;
  decisions: Decisions;
  state: DecisionState;
  selected: string | null;
  changed: ReadonlySet<string>;
  /** Titles of `mover` targets outside the chain, from the search. */
  targetTitles: ReadonlyMap<string, string>;
  onSelect: (ticket: string) => void;
};

const EDGE_COLORS: Record<ChainEdgeKind, string> = {
  cancela: "#ef4444",
  cortada: "#22c55e",
  movida: "#3b82f6",
  otro_tablero: "#f59e0b",
  pendiente: "var(--muted-foreground, #71717a)",
  atenuada: "var(--border, #d4d4d8)",
};

const CUT_EDGES: Partial<Record<ChainEdgeKind, true>> = {
  cortada: true,
  otro_tablero: true,
};

type RawEdge = { id: string; source: string; target: string };

function nodeId(node: NodoCadena, index: number): string {
  return node.tipo === "oculta" ? `oculta-${index}` : node.ticket;
}

function chainEdges(details: ChainDetails): RawEdge[] {
  const raiz = details.tarea.ticket;
  const edges: RawEdge[] = [];
  details.cadena.forEach((node, index) => {
    if (node.tipo !== "oculta") {
      for (const dep of node.depende_de) {
        edges.push({
          id: dep.relacion,
          source: dep.ticket,
          target: node.ticket,
        });
      }
      return;
    }
    // A hidden node carries no relations: it hangs from what would bring it
    // into play, or from the root.
    const target = nodeId(node, index);
    const sources =
      node.solo_si_cancelas.length > 0 ? node.solo_si_cancelas : [raiz];
    for (const source of sources) {
      edges.push({ id: `${source}->${target}`, source, target });
    }
  });
  return edges;
}

/** Positions from the dependencies graph's dagre layout, left to right. */
function layout(
  ids: string[],
  edges: RawEdge[],
): Map<string, { x: number; y: number }> {
  const relations: ProjectRelation[] = edges.map((e) => ({
    id: e.id,
    sourceTaskId: e.source,
    targetTaskId: e.target,
    relationType: "blocks",
  }));
  const model = buildGraphModel({
    // Only what the layout reads: ids, titles and an open status.
    tasks: ids.map(
      (id) =>
        ({
          id,
          number: null,
          title: id,
          status: "to-do",
          projectId: "",
          priority: null,
          assigneeName: null,
        }) as unknown as Task,
    ),
    columns: [],
    filteredTaskIds: new Set(ids),
    relations,
    externalTasks: [],
    showLoose: true,
    projectSlug: "",
    workspaceId: "",
    onOpenTask: () => {},
  });
  return new Map(model.nodes.map((n) => [n.id, n.position]));
}

export function buildChainGraph({
  details,
  decisions,
  state,
  selected,
  changed,
  targetTitles,
  onSelect,
}: BuildChainGraphOptions): ChainGraph {
  const raiz = details.tarea.ticket;
  const pendientes = new Set(state.pendientes);
  const inPlay = (node: NodoCadena) => isInPlay(node, state.canceladas);

  const nodes: Node<ChainNodeData>[] = [];
  const push = (id: string, data: ChainNodeData) =>
    nodes.push({
      id,
      type: "chainNode",
      position: { x: 0, y: 0 },
      data,
      draggable: false,
      connectable: false,
      selectable: data.clickable,
    });

  push(raiz, {
    kind: "raiz",
    ticket: raiz,
    titulo: details.tarea.titulo,
    tablero: details.tarea.tablero,
    responsable: null,
    asignado: null,
    dimmed: false,
    clickable: false,
    selected: false,
    changed: false,
    cuelgan: details.total,
    enCurso: false,
    focus: true,
  });

  details.cadena.forEach((node, index) => {
    const dimmed = !inPlay(node);
    const base = {
      dimmed,
      selected: false,
      changed: node.tipo !== "oculta" && changed.has(node.ticket),
      clickable: false,
      cuelgan: 0,
      enCurso: false,
      focus: node.solo_si_cancelas.length === 0,
      asignado: null,
    };
    if (node.tipo === "oculta") {
      push(nodeId(node, index), {
        ...base,
        kind: "oculta",
        ticket: null,
        titulo: null,
        tablero: node.tablero,
        responsable: null,
      });
      return;
    }
    if (node.tipo === "otro_tablero") {
      push(node.ticket, {
        ...base,
        kind: "otro_tablero",
        ticket: node.ticket,
        titulo: node.titulo,
        tablero: node.tablero,
        responsable: node.responsable,
      });
      return;
    }
    const accion = decisions[node.ticket]?.accion;
    push(node.ticket, {
      ...base,
      kind:
        dimmed || pendientes.has(node.ticket) || !accion ? "pendiente" : accion,
      ticket: node.ticket,
      titulo: node.titulo,
      tablero: node.tablero,
      responsable: node.responsable,
      asignado: node.asignado,
      clickable: !dimmed,
      selected: selected === node.ticket,
      cuelgan: node.cuelgan,
      enCurso: node.en_curso,
      onSelect,
    });
  });

  const raw = chainEdges(details);
  const kinds = new Map<string, ChainEdgeKind>();
  const byTarget = new Map(
    details.cadena.map((n, i) => [nodeId(n, i), n] as const),
  );
  for (const edge of raw) {
    const target = byTarget.get(edge.target)!;
    kinds.set(edge.id, edgeKind(target, edge.source));
  }

  // `mover`: a new blue arrow from the chosen task.
  const known = new Set(nodes.map((n) => n.id));
  for (const move of state.efectos.movidas) {
    if (!known.has(move.a)) {
      known.add(move.a);
      push(move.a, {
        kind: "destino",
        ticket: move.a,
        titulo: targetTitles.get(move.a) ?? null,
        tablero: move.a.split("-")[0] ?? "",
        responsable: null,
        asignado: null,
        dimmed: false,
        clickable: false,
        selected: false,
        changed: false,
        cuelgan: 0,
        enCurso: false,
        focus: false,
      });
    }
    const id = `mover:${move.tarea}`;
    raw.push({ id, source: move.a, target: move.tarea });
    kinds.set(id, "movida");
  }

  function edgeKind(target: NodoCadena, source: string): ChainEdgeKind {
    if (!inPlay(target) || !state.canceladas.has(source)) return "atenuada";
    if (target.tipo !== "decidir") return "otro_tablero";
    if (pendientes.has(target.ticket)) return "pendiente";
    const accion = decisions[target.ticket]?.accion;
    if (accion === "cancelar") return "cancela";
    return accion ? "cortada" : "pendiente";
  }

  const positions = layout(
    nodes.map((n) => n.id),
    raw,
  );
  for (const node of nodes) {
    node.position = positions.get(node.id) ?? node.position;
  }

  const edges: Edge<ChainEdgeData>[] = raw.map((edge) => {
    const kind = kinds.get(edge.id)!;
    const color = EDGE_COLORS[kind];
    const cut = CUT_EDGES[kind] === true;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      data: { kind },
      label: cut ? "✂" : undefined,
      style: {
        stroke: color,
        strokeWidth: kind === "atenuada" ? 1 : 1.75,
        strokeDasharray: cut || kind === "pendiente" ? "5 4" : undefined,
        opacity: kind === "atenuada" ? 0.5 : 1,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    };
  });

  return { nodes, edges };
}
