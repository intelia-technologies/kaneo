// Test helper: the graph a CD-01 sample describes, as `load-graph.ts` would
// read it, with task ids equal to their keys.
import type { Graph, GraphRelation, GraphTask } from "./types";

type SampleNode = {
  tipo: string;
  ticket?: string;
  titulo?: string;
  tablero: string;
  estado?: string;
  depende_de?: { ticket: string; relacion: string }[];
  responsable?: string | null;
  asignado?: string | null;
  automatica?: boolean;
  rutina_activa?: boolean;
  en_curso?: boolean;
};

export type SampleError = {
  valor: {
    details: {
      tarea: { ticket: string; titulo: string; tablero: string };
      cadena: SampleNode[];
    };
  };
};

export function sampleTask(
  ticket: string,
  overrides: Partial<GraphTask> = {},
): GraphTask {
  const [slug, number] = ticket.split("-");
  return {
    id: ticket,
    ticket,
    projectId: `project-${slug}`,
    projectSlug: slug!,
    number: Number(number),
    title: ticket,
    status: "to-do",
    columnId: null,
    userId: null,
    assigneeName: null,
    automatica: null,
    responsable: null,
    routineActive: false,
    enCurso: false,
    visible: true,
    ...overrides,
  };
}

export function graphFromSample(sample: SampleError): Graph {
  const { tarea, cadena } = sample.valor.details;
  const root = sampleTask(tarea.ticket, { title: tarea.titulo });
  const tasks = new Map([[root.id, root]]);
  const relations: GraphRelation[] = [];
  for (const n of cadena) {
    if (!n.ticket) continue;
    tasks.set(
      n.ticket,
      sampleTask(n.ticket, {
        title: n.titulo,
        status: n.estado,
        responsable: n.responsable ?? null,
        assigneeName: n.asignado ?? null,
        automatica: n.automatica ?? null,
        routineActive: n.rutina_activa ?? false,
        enCurso: n.en_curso ?? false,
      }),
    );
    for (const d of n.depende_de ?? [])
      relations.push({ id: d.relacion, source: d.ticket, target: n.ticket });
  }
  return { root, tasks, relations };
}
