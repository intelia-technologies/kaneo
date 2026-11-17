import { describe, expect, it } from "vite-plus/test";
import { buildChain } from "./chain";
import { dependenciesErrorBody } from "./error-body";
import { readFixture, schemaErrors } from "./fixtures/read-fixture";
import { applyResolutions } from "./resolve";
import { graphFromSample, type SampleError } from "./sample-graph";
import type { RawResolution, TargetInfo } from "./types";

type ProblemSample = SampleError & {
  valor: unknown;
  entrada: {
    resoluciones: RawResolution[];
    contexto: {
      cadena_anterior?: unknown[];
      tareas?: Record<string, { estado: string }>;
    };
  };
};

// The 409 the fork builds from the graph a sample describes.
function firstCall(name: string) {
  const sample = readFixture<SampleError>(name);
  const graph = graphFromSample(sample);
  const chain = buildChain(graph);
  return {
    sample,
    body: dependenciesErrorBody({
      root: graph.root,
      chain,
      aplicacion: applyResolutions(chain, [], { root: graph.root.ticket }),
      motivoRecibido: false,
      conResoluciones: false,
    }),
  };
}

describe("409 DEPENDENCIAS_SIN_RESOLVER from the chain", () => {
  it.each(["error-sf-2491", "error-infra-381"])(
    "is the sample %s and passes esquema.json",
    (name) => {
      const { sample, body } = firstCall(name);
      expect(body).toEqual(sample.valor);
      expect(schemaErrors("error_dependencias", body)).toBeNull();
    },
  );

  it("has the nodes of SF-2371 (this board first within a level)", () => {
    const { sample, body } = firstCall("error-sf-2371");
    const expected = sample.valor.details.cadena;
    expect(body.details.cadena).toHaveLength(expected.length);
    expect(body.details.cadena).toEqual(expect.arrayContaining(expected));
    expect(body.details.cadena.map((n) => "ticket" in n && n.ticket)).toEqual([
      "SF-2073",
      "SF-1641",
      "INFRA-507",
      "INFRA-525",
      "INFRA-617",
      "INFRA-649",
      "SF-2341",
    ]);
    expect({ ...body, details: { ...body.details, cadena: [] } }).toEqual({
      ...(sample.valor as object),
      details: { ...sample.valor.details, cadena: [] },
    });
    expect(schemaErrors("error_dependencias", body)).toBeNull();
  });
});

describe("resolutions with problems", () => {
  it.each(["error-problemas-a", "error-problemas-b"])(
    "give the sample %s",
    (name) => {
      const sample = readFixture<ProblemSample>(name);
      const graph = graphFromSample(sample);
      const chain = buildChain(graph);
      const { contexto, resoluciones } = sample.entrada;
      const previous = contexto.cadena_anterior
        ? buildChain(
            graphFromSample({
              valor: {
                details: {
                  ...sample.valor.details,
                  cadena: contexto.cadena_anterior,
                },
              },
            } as SampleError),
          )
        : undefined;
      const targets = contexto.tareas
        ? new Map<string, TargetInfo>(
            resoluciones.flatMap((r) =>
              r.a
                ? [
                    [
                      r.a,
                      contexto.tareas![r.a]
                        ? { id: r.a, status: contexto.tareas![r.a]!.estado }
                        : graph.tasks.has(r.a)
                          ? { id: r.a, status: "to-do" }
                          : null,
                    ] as const,
                  ]
                : [],
            ),
          )
        : undefined;
      const body = dependenciesErrorBody({
        root: graph.root,
        chain,
        aplicacion: applyResolutions(chain, resoluciones, {
          root: graph.root.ticket,
          previous,
          targets,
        }),
        motivoRecibido: true,
        conResoluciones: true,
      });
      expect(body).toEqual(sample.valor);
      expect(schemaErrors("error_dependencias", body)).toBeNull();
    },
  );

  it("apply the request sample entirely: nothing pending, the effects of the 200", () => {
    const graph = graphFromSample(readFixture<SampleError>("error-sf-2491"));
    const chain = buildChain(graph);
    const { valor: peticion } = readFixture<{
      valor: { resoluciones: RawResolution[] };
    }>("peticion-sf-2491");
    const { pendientes, problemas, efectos } = applyResolutions(
      chain,
      peticion.resoluciones,
      {
        root: "SF-2491",
      },
    );
    expect(pendientes).toEqual([]);
    expect(problemas).toEqual([]);
    expect({
      canceladas: ["SF-2491", ...efectos.enCascada.map((n) => n.task.ticket)],
      quitadas: efectos.quitadas.map((e) => e.node.task.ticket),
      movidas: efectos.movidas.map((e) => ({
        tarea: e.node.task.ticket,
        de: e.de,
        a: e.a,
      })),
      otros: efectos.otrosTableros.map((e) => [e.node.task.ticket, e.de]),
    }).toEqual({
      canceladas: ["SF-2491", "SF-2493", "SF-2494"],
      quitadas: ["SF-2495", "SF-2496", "SF-2505", "SF-2497"],
      movidas: [{ tarea: "SF-2499", de: ["SF-2493", "SF-2494"], a: "SF-2496" }],
      otros: [["KF-15", ["SF-2491"]]],
    });
  });

  it("count the tasks of a batch as cancelled (decision 18)", () => {
    const graph = graphFromSample(readFixture<SampleError>("error-sf-2491"));
    const chain = buildChain(graph);
    const { pendientes } = applyResolutions(chain, [], {
      root: "SF-2491",
      lote: new Set(["SF-2493", "SF-2495", "SF-2496"]),
    });
    expect(pendientes.map((n) => n.task.ticket)).toEqual([
      "SF-2494",
      "SF-2505",
      "SF-2497",
      "SF-2499",
      "SF-2498",
    ]);
  });

  it("treat a hidden task as a target that does not exist, naming nothing of it", () => {
    const graph = graphFromSample(readFixture<SampleError>("error-sf-2491"));
    graph.tasks.get("KF-15")!.visible = false;
    const chain = buildChain(graph);
    const { problemas, pendientes } = applyResolutions(
      chain,
      [{ tarea: "SF-2493", accion: "mover", a: "KF-15" }],
      { root: "SF-2491", targets: new Map([["KF-15", null]]), edges: [] },
    );
    expect(problemas).toContainEqual({
      tarea: "SF-2493",
      problema: "a_no_existe",
      detalle: "KF-15 no existe.",
    });
    expect(pendientes.map((n) => n.task.ticket)).toContain("SF-2493");
  });
});
