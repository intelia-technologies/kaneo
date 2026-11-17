import { describe, expect, it } from "vite-plus/test";
import {
  branchOf,
  cancelAll,
  evaluateDecisions,
  reconcileDecisions,
  releaseAll,
  type Decision,
  type Decisions,
} from "./decisions";
import {
  sampleProblemasA,
  sampleProblemasAPreviousChain,
  sampleProblemasARequest,
  sampleProblemasB,
  sampleProblemasBRequest,
  sampleRequestSf2491,
  sampleResultSf2491,
  sampleSf2491,
} from "./samples.test-data";

const fromRequest = (
  resoluciones: { tarea: string; accion: string; a?: string }[] = [],
): Decisions =>
  Object.fromEntries(
    resoluciones.map((r) => [
      r.tarea,
      (r.a ? { accion: r.accion, a: r.a } : { accion: r.accion }) as Decision,
    ]),
  );

describe("evaluateDecisions", () => {
  it("resolves SF-2491 with the sample request into the sample result", () => {
    const state = evaluateDecisions(
      sampleSf2491.details,
      fromRequest(sampleRequestSf2491.resoluciones),
    );

    expect(state.pendientes).toEqual([]);
    expect(state.problemas).toEqual([]);
    expect([...state.canceladas].sort()).toEqual(
      [...sampleResultSf2491.canceladas].sort(),
    );
    expect(state.efectos.quitadas.map((q) => q.tarea).sort()).toEqual(
      [...sampleResultSf2491.quitadas].sort(),
    );
    expect(
      state.efectos.movidas.map(({ tarea, de, a }) => ({ tarea, de, a })),
    ).toEqual(sampleResultSf2491.movidas);
    expect(state.efectos.otros_tableros).toMatchObject([
      { tarea: "KF-15", responsable: "agent:forja" },
    ]);
  });

  it("keeps decisions below a released node out of what it sends", () => {
    const state = evaluateDecisions(sampleSf2491.details, {
      "SF-2493": { accion: "quitar" },
      "SF-2494": { accion: "cancelar" },
    });

    expect(state.resoluciones).toEqual([
      { tarea: "SF-2493", accion: "quitar" },
    ]);
    expect(state.problemas.map((p) => p.problema)).not.toContain("sobra");
    expect(state.pendientes).toEqual(["SF-2495", "SF-2496"]);
  });

  it("leaves a `mover` without target pending", () => {
    const state = evaluateDecisions(sampleSf2491.details, {
      ...releaseAll({}, sampleSf2491.details.cadena),
      "SF-2493": { accion: "mover" },
    });

    expect(state.pendientes).toEqual(["SF-2493"]);
  });
});

describe("toolbar actions", () => {
  it("«Cancelar todo» cancels the root and its 13 same-board tasks", () => {
    const state = evaluateDecisions(
      sampleSf2491.details,
      cancelAll(sampleSf2491.details.cadena),
    );

    expect(state.pendientes).toEqual([]);
    expect(state.canceladas.size).toBe(14);
    expect(state.efectos.otros_tableros).toHaveLength(1);
  });

  it("«Liberar todo» releases the direct dependents and nothing else", () => {
    const decisions = releaseAll({}, sampleSf2491.details.cadena);

    expect(decisions).toEqual({
      "SF-2493": { accion: "quitar" },
      "SF-2495": { accion: "quitar" },
      "SF-2496": { accion: "quitar" },
    });
    expect(
      evaluateDecisions(sampleSf2491.details, decisions).pendientes,
    ).toEqual([]);
  });

  it("finds a branch through shared nodes, once each", () => {
    expect(branchOf(sampleSf2491.details.cadena, "SF-2496")).toEqual([
      "SF-2496",
      "SF-2498",
      "SF-2504",
    ]);
  });
});

describe("reconcileDecisions", () => {
  it("keeps what still holds and flags what entered the chain", () => {
    const { decisions: kept, changed } = reconcileDecisions(
      fromRequest(sampleProblemasARequest),
      sampleProblemasAPreviousChain,
      sampleProblemasA.details,
    );

    expect(changed).toEqual(new Set(["SF-2504"]));
    expect(kept).toEqual({
      "SF-2493": { accion: "cancelar" },
      "SF-2496": { accion: "cancelar" },
      // Out of play now (`sobra`), but still a valid choice if SF-2500 is
      // cancelled later: the panel keeps it and does not send it.
      "SF-2501": { accion: "quitar" },
    });
  });

  it("drops the moves the fork rejected", () => {
    const { decisions } = reconcileDecisions(
      fromRequest(sampleProblemasBRequest),
      sampleProblemasB.details.cadena,
      sampleProblemasB.details,
    );

    expect(decisions).toEqual({
      "SF-2493": { accion: "cancelar" },
      "SF-2495": { accion: "cancelar" },
      "SF-2496": { accion: "quitar" },
      "SF-2497": { accion: "quitar" },
    });
  });
});
