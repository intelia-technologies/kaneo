import { describe, expect, it } from "vite-plus/test";
import type { ErrorDependenciasSinResolver } from "./contract/cancelar-con-dependientes";
import {
  buildChainGraph,
  CHAIN_NODE_HEIGHT,
  CHAIN_NODE_WIDTH,
  type ChainGraph,
} from "./chain-graph-model";
import {
  cancelBranch,
  evaluateDecisions,
  withDecision,
  type Decisions,
} from "./decisions";
import {
  sampleInfra381,
  sampleSf2371,
  sampleSf2491,
} from "./samples.test-data";

function graph(
  sample: ErrorDependenciasSinResolver,
  decisions: Decisions = {},
  targetTitles: ReadonlyMap<string, string> = new Map(),
): ChainGraph {
  return buildChainGraph({
    details: sample.details,
    decisions,
    state: evaluateDecisions(sample.details, decisions),
    selected: null,
    changed: new Set(),
    targetTitles,
    onSelect: () => {},
  });
}

const node = (g: ChainGraph, id: string) => {
  const found = g.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found.data;
};
const edgesTouching = (g: ChainGraph, id: string) =>
  g.edges.filter((e) => e.source === id || e.target === id);
const edge = (g: ChainGraph, source: string, target: string) =>
  g.edges.find((e) => e.source === source && e.target === target);

describe("buildChainGraph", () => {
  it("draws SF-2491 with the root and its 14 nodes, SF-2499 once with every arrow", () => {
    const g = graph(sampleSf2491);

    expect(g.nodes).toHaveLength(15);
    expect(node(g, "SF-2491").kind).toBe("raiz");
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(15);
    expect(g.nodes.filter((n) => n.id === "SF-2499")).toHaveLength(1);

    // Every relation the CD-01 sample carries for it: four in (SF-2493,
    // SF-2494, SF-2495, SF-2505) and two out (SF-2498, SF-2500).
    const sf2499 = sampleSf2491.details.cadena.find(
      (n) => n.tipo !== "oculta" && n.ticket === "SF-2499",
    );
    const incoming = sf2499 && "depende_de" in sf2499 ? sf2499.depende_de : [];
    const outgoing = sampleSf2491.details.cadena.filter(
      (n) =>
        n.tipo !== "oculta" && n.depende_de.some((d) => d.ticket === "SF-2499"),
    );
    expect(edgesTouching(g, "SF-2499")).toHaveLength(
      incoming.length + outgoing.length,
    );
    for (const dep of incoming) {
      expect(edge(g, dep.ticket, "SF-2499")).toBeDefined();
    }
    for (const dependent of outgoing) {
      if (dependent.tipo === "oculta") continue;
      expect(edge(g, "SF-2499", dependent.ticket)).toBeDefined();
    }
  });

  it("lays INFRA-381's 28 nodes out without overlapping", () => {
    const g = graph(sampleInfra381);

    expect(g.nodes).toHaveLength(29);
    for (let i = 0; i < g.nodes.length; i++) {
      for (let j = i + 1; j < g.nodes.length; j++) {
        const a = g.nodes[i]!.position;
        const b = g.nodes[j]!.position;
        const overlaps =
          Math.abs(a.x - b.x) < CHAIN_NODE_WIDTH &&
          Math.abs(a.y - b.y) < CHAIN_NODE_HEIGHT;
        expect(overlaps, `${g.nodes[i]!.id} / ${g.nodes[j]!.id}`).toBe(false);
      }
    }
  });

  it("starts with the direct dependents undecided and the rest dimmed", () => {
    const g = graph(sampleSf2491);

    expect(node(g, "SF-2493")).toMatchObject({
      kind: "pendiente",
      dimmed: false,
      clickable: true,
    });
    expect(node(g, "SF-2494")).toMatchObject({
      dimmed: true,
      clickable: false,
    });
    expect(edge(g, "SF-2491", "SF-2493")?.data?.kind).toBe("pendiente");
  });

  it("«Cancelar con su rama» marks the whole same-board branch", () => {
    const decisions = cancelBranch({}, sampleSf2491.details.cadena, "SF-2493");
    const g = graph(sampleSf2491, decisions);

    for (const ticket of [
      "SF-2493",
      "SF-2494",
      "SF-2505",
      "SF-2497",
      "SF-2499",
      "SF-2498",
      "SF-2500",
      "SF-2501",
      "SF-2502",
      "SF-2503",
      "SF-2504",
    ]) {
      expect(node(g, ticket).kind, ticket).toBe("cancelar");
      expect(node(g, ticket).dimmed, ticket).toBe(false);
    }
    // Not in SF-2493's branch.
    expect(node(g, "SF-2495").kind).toBe("pendiente");
    expect(node(g, "SF-2496").kind).toBe("pendiente");
    expect(node(g, "KF-15").kind).toBe("otro_tablero");
    expect(edge(g, "SF-2493", "SF-2494")?.data?.kind).toBe("cancela");
  });

  it("«Quitar» cuts the arrow and dims the branch", () => {
    const cancelled = cancelBranch({}, sampleSf2491.details.cadena, "SF-2493");
    const g = graph(
      sampleSf2491,
      withDecision(cancelled, "SF-2493", { accion: "quitar" }),
    );

    const cut = edge(g, "SF-2491", "SF-2493");
    expect(node(g, "SF-2493").kind).toBe("quitar");
    expect(cut?.data?.kind).toBe("cortada");
    expect(cut?.label).toBe("✂");
    expect(cut?.style?.strokeDasharray).toBeDefined();
    // Its branch is no longer touched, though the decisions are kept.
    expect(node(g, "SF-2494")).toMatchObject({
      dimmed: true,
      clickable: false,
    });
    expect(node(g, "SF-2505").dimmed).toBe(true);
    expect(edge(g, "SF-2493", "SF-2494")?.data?.kind).toBe("atenuada");
  });

  it("«Mover a…» draws a blue arrow from the chosen task", () => {
    let decisions = cancelBranch({}, sampleSf2491.details.cadena, "SF-2493");
    decisions = withDecision(decisions, "SF-2499", {
      accion: "mover",
      a: "SF-2496",
    });
    const g = graph(sampleSf2491, decisions);

    const moved = edge(g, "SF-2496", "SF-2499");
    expect(node(g, "SF-2499").kind).toBe("mover");
    expect(moved?.data?.kind).toBe("movida");
    expect(moved?.style?.stroke).toBe("#3b82f6");
    expect(edge(g, "SF-2493", "SF-2499")?.data?.kind).toBe("cortada");
  });

  it("adds a node for a «Mover a…» target outside the chain", () => {
    const g = graph(
      sampleSf2491,
      { "SF-2493": { accion: "mover", a: "SF-2600" } },
      new Map([["SF-2600", "[PZ-05b] Segunda mitad"]]),
    );

    expect(node(g, "SF-2600")).toMatchObject({
      kind: "destino",
      titulo: "[PZ-05b] Segunda mitad",
    });
    expect(edge(g, "SF-2600", "SF-2493")?.data?.kind).toBe("movida");
  });

  it("draws other-board nodes amber with their owner, never clickable", () => {
    const g = graph(sampleSf2371, { "SF-2073": { accion: "cancelar" } });

    for (const ticket of ["INFRA-507", "INFRA-525", "INFRA-617", "INFRA-649"]) {
      expect(node(g, ticket)).toMatchObject({
        kind: "otro_tablero",
        responsable: "agent:pasquale",
        clickable: false,
        dimmed: false,
      });
      expect(edge(g, "SF-2073", ticket)?.data?.kind).toBe("otro_tablero");
    }
  });

  it("dims other-board nodes that nothing cancelled reaches", () => {
    const g = graph(sampleSf2371, { "SF-2073": { accion: "quitar" } });

    expect(node(g, "INFRA-507")).toMatchObject({
      kind: "otro_tablero",
      dimmed: true,
    });
    // INFRA-617 also hangs from the root: it is touched anyway.
    expect(node(g, "INFRA-617").dimmed).toBe(false);
  });

  it("draws hidden nodes without key or title", () => {
    // What the fork sends to someone who cannot read INFRA (decision 15).
    const hidden: ErrorDependenciasSinResolver = {
      ...sampleSf2371,
      details: {
        ...sampleSf2371.details,
        cadena: sampleSf2371.details.cadena.map((n) =>
          n.tipo === "otro_tablero"
            ? {
                tipo: "oculta",
                tablero: n.tablero,
                nivel: n.nivel,
                solo_si_cancelas: n.solo_si_cancelas,
              }
            : n,
        ),
      },
    };
    const g = graph(hidden, { "SF-2073": { accion: "cancelar" } });
    const hiddenNodes = g.nodes.filter((n) => n.data.kind === "oculta");

    expect(hiddenNodes).toHaveLength(4);
    for (const n of hiddenNodes) {
      expect(n.data).toMatchObject({
        ticket: null,
        titulo: null,
        responsable: null,
        tablero: "INFRA",
        clickable: false,
      });
      expect(JSON.stringify(n.data)).not.toMatch(/INFRA-\d/);
    }
    expect(edgesTouching(g, hiddenNodes[0]!.id).length).toBeGreaterThan(0);
  });
});
