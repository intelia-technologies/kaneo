// Shapes of the cancellation with dependents (design 82 §4.2–§4.6). The
// public ones follow the contract of CD-01 (`fixtures/esquema.json`).

export type Accion = "cancelar" | "quitar" | "mover";
export const ACCIONES: readonly Accion[] = ["cancelar", "quitar", "mover"];

/** A task as the chain needs it, read in one go (`load-graph.ts`). */
export type GraphTask = {
  id: string;
  ticket: string;
  projectId: string;
  projectSlug: string;
  number: number;
  title: string;
  status: string;
  columnId: string | null;
  userId: string | null;
  assigneeName: string | null;
  /** `null` without a `task_automation` row. */
  automatica: boolean | null;
  responsable: string | null;
  routineActive: boolean;
  enCurso: boolean;
  /** The caller reads its project (decision 15). */
  visible: boolean;
};

/** A `blocks` relation: `source` blocks `target`. */
export type GraphRelation = { id: string; source: string; target: string };

/**
 * The root, the open tasks below it (§4.1) and the relations that leave the
 * root or a task of its board: nothing below a task of another board.
 */
export type Graph = {
  root: GraphTask;
  tasks: Map<string, GraphTask>;
  relations: GraphRelation[];
};

export type Dependencia = { ticket: string; relacion: string; taskId: string };

/** A node with everything the service needs; `toPublicNode` hides what it must. */
export type ChainNode = {
  task: GraphTask;
  tipo: "decidir" | "otro_tablero";
  oculta: boolean;
  nivel: number;
  dependeDe: Dependencia[];
  soloSiCancelas: string[];
  cuelgan: number;
};

/** A resolution as it arrives: the action is checked by `applyResolutions`. */
export type RawResolution = { tarea: string; accion: string; a?: string };

export type Problema = { tarea: string; problema: string; detalle: string };

export type EfectoQuitar = {
  node: ChainNode;
  de: string[];
  relaciones: string[];
};
export type EfectoMover = EfectoQuitar & { a: string };

export type Efectos = {
  enCascada: ChainNode[];
  quitadas: EfectoQuitar[];
  movidas: EfectoMover[];
  otrosTableros: EfectoQuitar[];
};

export type Aplicacion = {
  pendientes: ChainNode[];
  problemas: Problema[];
  efectos: Efectos;
};

/** What a `mover` target is, as the caller sees it. */
export type TargetInfo = { id: string; status: string } | null;
