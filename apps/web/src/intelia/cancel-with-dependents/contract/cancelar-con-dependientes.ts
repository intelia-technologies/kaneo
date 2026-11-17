/**
 * CD-01: contrato de la cancelación con dependientes (diseño 82 §4.2, §4.3 y §4.8).
 * Lo comparten el fork de Kaneo (`POST /api/intelia/task/{taskId}/cancel` y la guarda de los caminos viejos, que valida
 * sus respuestas contra `esquema.json`), el gateway (`kaneo.update_task_status` con `motivo` y `resoluciones`), el
 * despachador (`intelia.task.cancelled_with_dependents`) y la web (panel D).
 *
 * Vocabulario:
 * - **raíz**: la tarea que se quiere cancelar. Su proyecto es «este tablero» (decisión 8).
 * - **cadena**: todo lo que puede verse afectado (§4.1). Cada tarea sale una vez (decisión 11). Solo se baja por las
 *   tareas de este tablero; las de otro tablero y las ocultas son hojas (decisión 9).
 * - **en juego**: un nodo entra en juego si depende de la raíz o de una tarea de la cadena que se cancela.
 */

export const ERROR_DEPENDENCIAS_SIN_RESOLVER = "DEPENDENCIAS_SIN_RESOLVER" as const;
export const ERROR_CANCELAR_SIN_PERMISO = "CANCELAR_SIN_PERMISO" as const;
/** Evento del fork tras confirmar una cancelación con dependientes (§4.6). */
export const EVENTO_CANCELADA_CON_DEPENDIENTES = "intelia.task.cancelled_with_dependents" as const;

export const ESTADOS_HTTP_CANCELAR = {
  [ERROR_DEPENDENCIAS_SIN_RESOLVER]: 409,
  [ERROR_CANCELAR_SIN_PERMISO]: 403,
} as const;

/** Ruta del fork (§4.3), relativa a `/api`. */
export function rutaCancelarTarea(taskId: string): string {
  return `/intelia/task/${encodeURIComponent(taskId)}/cancel`;
}

/** Como mucho estos nodos en `cadena`; con más, `truncada: true` y los primeros por nivel (§4.2). */
export const MAX_NODOS_CADENA = 200;
export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 1000;

export const ACCIONES_RESOLUCION = ["cancelar", "quitar", "mover"] as const;
export type AccionResolucion = (typeof ACCIONES_RESOLUCION)[number];

export const TIPOS_NODO_CADENA = ["decidir", "otro_tablero", "oculta"] as const;
export type TipoNodoCadena = (typeof TIPOS_NODO_CADENA)[number];

/**
 * Problemas conocidos (§4.2). El catálogo puede crecer: quien lee un `problema` que no conoce lo trata como texto
 * (el validador lo acepta), sin romper.
 */
export const PROBLEMAS_RESOLUCION = [
  "falta",
  "sobra",
  "accion_desconocida",
  "falta_a",
  "a_no_existe",
  "a_se_cancela",
  "a_cancelada",
  "a_es_ella_misma",
  "ciclo",
  "cadena_cambiada",
] as const;
export type CodigoProblemaResolucion = (typeof PROBLEMAS_RESOLUCION)[number];

/** Clave de tarea de Kaneo (`SF-2491`). */
export const CLAVE_TAREA = /^[A-Z][A-Z0-9]*-\d+$/;
const ACTOR = /^[a-z]+:[A-Za-z0-9._-]{1,120}$/;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

// ── Tipos ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Resolucion {
  /** Clave de la dependiente. */
  tarea: string;
  accion: AccionResolucion;
  /** Solo con `mover`: clave de la tarea que pasa a bloquearla. */
  a?: string;
}

export interface DependenciaNodo {
  /** Clave de la raíz o de otra tarea de la cadena. */
  ticket: string;
  /** Id de la relación `blocks` en el fork. */
  relacion: string;
}

interface NodoVisibleBase {
  ticket: string;
  titulo: string;
  /** Clave del proyecto (`SF`, `INFRA`…). */
  tablero: string;
  /** Slug de la columna. Nunca `done` ni `cancelled` (decisión 10). */
  estado: string;
  /** Camino más largo desde la raíz: un nodo va siempre después de todo aquello de lo que depende. */
  nivel: number;
  /**
   * Sus relaciones hacia la raíz y hacia las tareas `decidir` de la cadena (las que se pueden cancelar); las que tiene
   * con otras tareas no salen.
   */
  depende_de: DependenciaNodo[];
  /**
   * Vacía si depende de la raíz: entra en juego siempre. Si no, las tareas de la cadena de las que depende: entra en
   * juego si se cancela cualquiera de ellas.
   */
  solo_si_cancelas: string[];
  /** `automation.responsable` (id del grafo), o `null` si no tiene. */
  responsable: string | null;
}

export interface NodoDecidir extends NodoVisibleBase {
  tipo: "decidir";
  opciones: AccionResolucion[];
  /** Nodos de la cadena que cuelgan de este (transitivo): los que entran en juego si se cancela. */
  cuelgan: number;
  /** Nombre del usuario de Kaneo asignado, o `null`. */
  asignado: string | null;
  automatica: boolean;
  rutina_activa: boolean;
  /** Tiene un worker o una PR abierta. */
  en_curso: boolean;
}

export interface NodoOtroTablero extends NodoVisibleBase {
  tipo: "otro_tablero";
  /** Lo que se hará solo al cancelar: quitar la dependencia, apagar la automática y avisar (decisión 3). */
  automatico: string;
}

/** Tarea de un proyecto que quien pregunta no lee (decisión 15): sin clave, título ni responsable. */
export interface NodoOculto {
  tipo: "oculta";
  tablero: string;
  nivel: number;
  solo_si_cancelas: string[];
}

export type NodoCadena = NodoDecidir | NodoOtroTablero | NodoOculto;

export interface ProblemaResolucion {
  /** Clave de la tarea a la que se refiere (la dependiente, o la raíz en `cadena_cambiada` si no hay otra). */
  tarea: string;
  /** Uno de `PROBLEMAS_RESOLUCION`, o uno nuevo que se lee como texto. */
  problema: CodigoProblemaResolucion | (string & {});
  detalle: string;
}

/** Entrada de `ejemplo_resoluciones`: la acción va sin elegir (`"elige: …"`), nunca preelegida. */
export interface EjemploResolucion {
  tarea: string;
  accion: string;
  a?: string;
}

export interface ErrorDependenciasSinResolver {
  error: typeof ERROR_DEPENDENCIAS_SIN_RESOLVER;
  message: string;
  details: {
    tarea: { ticket: string; titulo: string; tablero: string };
    motivo: { requerido: boolean; recibido: boolean };
    /** Nodos reales de la cadena, aunque `cadena` esté truncada. */
    total: number;
    truncada: boolean;
    cadena: NodoCadena[];
    /** Nodos `decidir` en juego sin resolución válida. */
    pendientes: string[];
    /** Vacía en la primera respuesta. */
    problemas: ProblemaResolucion[];
    opciones: Record<AccionResolucion, string>;
    otros_tableros: string;
    ejemplo_resoluciones: EjemploResolucion[];
    /** Lo añade el gateway (§4.2): la llamada lista para rellenar. */
    llamada?: { herramienta: string; argumentos: Record<string, unknown> };
    a_mano: string;
  };
}

export interface ErrorCancelarSinPermiso {
  error: typeof ERROR_CANCELAR_SIN_PERMISO;
  message: string;
  details: {
    /** `falta`: la relación del grafo que falta (`member`, `can_set_automation`…) y sobre qué. */
    tareas: { tarea: string; falta: string }[];
  };
}

/** Cuerpo de `POST /api/intelia/task/{taskId}/cancel` (§4.3). */
export interface PeticionCancelar {
  /** Obligatorio solo si la tarea tiene dependientes abiertas (decisión 21); si no, el `409` lo pide. */
  motivo?: string;
  resoluciones?: Resolucion[];
  /** Id del grafo de quien cancela, para el comentario y el evento. */
  actor?: string;
  /** `externalUserName`, como en `publicarComentario`. */
  firma?: string;
  /** Solo desde los caminos de lote (decisión 18): ids o claves de las tareas del lote. */
  lote?: string[];
}

export interface MovidaCancelar {
  tarea: string;
  /** Claves de las tareas canceladas de las que dependía. */
  de: string[];
  a: string;
}

export type OtroTableroResultado = { tarea: string; responsable: string | null } | { oculta: true; tablero: string };

/** Respuesta `200` de `/cancel`. */
export interface ResultadoCancelar {
  /** Todas las canceladas, empezando por la raíz. */
  canceladas: string[];
  quitadas: string[];
  movidas: MovidaCancelar[];
  otros_tableros: OtroTableroResultado[];
  /** Comentarios publicados. */
  comentarios: number;
}

/** `intelia.task.cancelled_with_dependents` (§4.6). Va al despachador, que lo ve todo: sin nodos ocultos. */
export interface EventoCanceladaConDependientes {
  raiz: string;
  actor: string;
  motivo: string;
  /** Todas las canceladas, empezando por la raíz. */
  canceladas: string[];
  quitadas: string[];
  movidas: MovidaCancelar[];
  otros_tableros: { tarea: string; proyecto: string; responsable: string | null }[];
  /** ISO 8601 UTC. */
  en: string;
}

// ── aplicarResoluciones ─────────────────────────────────────────────────────────────────────────────────────────

export interface ContextoResoluciones {
  /** Clave de la raíz. Si falta, se deduce de `depende_de` (lo que no es un nodo de la cadena). */
  raiz?: string;
  /** Estado de las tareas que conoce quien llama, para `a_no_existe` y `a_cancelada` con un `a` fuera de la cadena. */
  tareas?: Readonly<Record<string, { estado: string }>>;
  /** Otras relaciones `blocks` (`source` bloquea a `target`, por clave) para detectar ciclos fuera de la cadena. */
  relaciones?: readonly { source: string; target: string }[];
  /** La cadena que vio quien resolvió: si no coincide con la de ahora, `cadena_cambiada` (decisión 12). */
  cadena_anterior?: readonly NodoCadena[];
}

export interface EfectoQuitar {
  tarea: string;
  /** Claves de las canceladas de las que deja de depender. */
  de: string[];
  relaciones: string[];
}

export interface EfectoMover extends EfectoQuitar {
  a: string;
}

export type EfectoOtroTablero =
  | { tarea: string; tablero: string; responsable: string | null; de: string[]; relaciones: string[] }
  | { oculta: true; tablero: string; nivel: number };

export interface EfectosResoluciones {
  /** Las que se cancelan además de la raíz, en el orden de la cadena. */
  en_cascada: string[];
  quitadas: EfectoQuitar[];
  movidas: EfectoMover[];
  otros_tableros: EfectoOtroTablero[];
}

export interface AplicacionResoluciones {
  pendientes: string[];
  problemas: ProblemaResolucion[];
  efectos: EfectosResoluciones;
}

type NodoVisible = NodoDecidir | NodoOtroTablero;
const visible = (n: NodoCadena): n is NodoVisible => n.tipo !== "oculta";

/** Huella de cada nodo para comparar dos cadenas: los visibles por clave; los ocultos por lo que se ve de ellos. */
function huellaCadena(cadena: readonly NodoCadena[]): Map<string, string> {
  const huellas = new Map<string, string>();
  for (const n of cadena) {
    if (visible(n)) {
      huellas.set(n.ticket, `${n.tipo}|${n.depende_de.map((d) => `${d.ticket}:${d.relacion}`).sort().join(",")}`);
      continue;
    }
    const base = `oculta|${n.tablero}|${n.nivel}|${[...n.solo_si_cancelas].sort().join(",")}`;
    let i = 0;
    while (huellas.has(`${base}#${i}`)) i++;
    huellas.set(`${base}#${i}`, "");
  }
  return huellas;
}

function raizDe(cadena: readonly NodoCadena[]): string | undefined {
  const claves = new Set(cadena.filter(visible).map((n) => n.ticket));
  for (const n of cadena) if (visible(n)) for (const d of n.depende_de) if (!claves.has(d.ticket)) return d.ticket;
  return undefined;
}

/**
 * Aplica `resoluciones` a la `cadena` de un `409` sin tocar nada (§4.8): qué queda por decidir, qué está mal y qué
 * pasaría. Es la regla de referencia; el fork tiene su propia implementación, que pasa las mismas muestras.
 *
 * - Un nodo entra en juego si `solo_si_cancelas` está vacía o si se cancela alguna de sus tareas.
 * - `pendientes`: nodos `decidir` en juego sin una resolución válida.
 * - `quitar` y `mover` actúan sobre todas sus relaciones hacia tareas que se cancelan (raíz incluida), y solo esas.
 * - `efectos.otros_tableros`: los nodos de otro tablero y ocultos en juego.
 * - Con `resoluciones` no vacías, cada pendiente sin resolución da `falta`; sin ellas, `problemas` sale vacía.
 * - Con una cadena truncada (`truncada: true`) el resultado solo cubre los nodos que trae: «nada pendiente» no
 *   quiere decir que la cadena esté resuelta (§4.2: se resuelve a mano o por partes).
 */
export function aplicarResoluciones(
  cadena: readonly NodoCadena[],
  resoluciones: readonly unknown[] = [],
  contexto: ContextoResoluciones = {},
): AplicacionResoluciones {
  const raiz = contexto.raiz ?? raizDe(cadena);
  const nodos = new Map<string, NodoVisible>();
  for (const n of cadena) if (visible(n)) nodos.set(n.ticket, n);
  const problemas: ProblemaResolucion[] = [];
  const problema = (tarea: string, codigo: CodigoProblemaResolucion, detalle: string) =>
    problemas.push({ tarea, problema: codigo, detalle });

  if (contexto.cadena_anterior) {
    const antes = huellaCadena(contexto.cadena_anterior);
    const ahora = huellaCadena(cadena);
    const cambiadas = [...new Set([...antes.keys(), ...ahora.keys()])].filter((k) => antes.get(k) !== ahora.get(k));
    for (const k of cambiadas) {
      const tarea = k.startsWith("oculta|") ? (raiz ?? k) : k;
      const detalle = !antes.has(k)
        ? "Ha entrado en la cadena después de que la vieras."
        : !ahora.has(k)
          ? "Ya no está en la cadena."
          : "Han cambiado sus dependencias dentro de la cadena.";
      problema(tarea, "cadena_cambiada", detalle);
    }
  }

  // Una resolución por tarea; la primera manda.
  const porTarea = new Map<string, { accion: unknown; a: unknown }>();
  for (const r of resoluciones) {
    const tarea = objeto(r) && typeof r.tarea === "string" ? r.tarea : undefined;
    if (tarea === undefined) {
      problema(String(objeto(r) ? r.tarea : r), "sobra", "Resolución sin `tarea`.");
      continue;
    }
    if (porTarea.has(tarea)) {
      problema(tarea, "sobra", "Resolución repetida: cada tarea lleva una sola.");
      continue;
    }
    porTarea.set(tarea, { accion: (r as Objeto).accion, a: (r as Objeto).a });
  }
  const accionDe = (ticket: string): AccionResolucion | undefined => {
    const accion = porTarea.get(ticket)?.accion;
    return esAccionResolucion(accion) ? accion : undefined;
  };

  // En juego: punto fijo sobre la cadena (un nodo entra si se cancela alguna de sus tareas).
  const canceladas = new Set<string>(raiz ? [raiz] : []);
  const enJuego = new Set<NodoCadena>();
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const n of cadena) {
      if (enJuego.has(n)) continue;
      if (n.solo_si_cancelas.length > 0 && !n.solo_si_cancelas.some((t) => canceladas.has(t))) continue;
      enJuego.add(n);
      cambio = true;
      if (n.tipo === "decidir" && accionDe(n.ticket) === "cancelar") canceladas.add(n.ticket);
    }
  }

  const pendientes: string[] = [];
  const efectos: EfectosResoluciones = { en_cascada: [], quitadas: [], movidas: [], otros_tableros: [] };
  const hacia = (n: NodoVisible) => n.depende_de.filter((d) => canceladas.has(d.ticket));
  const hayResoluciones = resoluciones.length > 0;
  for (const n of cadena) {
    if (!enJuego.has(n)) continue;
    if (n.tipo === "oculta") {
      efectos.otros_tableros.push({ oculta: true, tablero: n.tablero, nivel: n.nivel });
      continue;
    }
    const cortadas = hacia(n);
    const de = cortadas.map((d) => d.ticket);
    const relaciones = cortadas.map((d) => d.relacion);
    if (n.tipo === "otro_tablero") {
      efectos.otros_tableros.push({ tarea: n.ticket, tablero: n.tablero, responsable: n.responsable, de, relaciones });
      continue;
    }
    const r = porTarea.get(n.ticket);
    if (r === undefined) {
      pendientes.push(n.ticket);
      if (hayResoluciones) problema(n.ticket, "falta", "Está en juego y no tiene resolución: elige cancelar, quitar o mover.");
      continue;
    }
    const accion = accionDe(n.ticket);
    if (accion === undefined) {
      pendientes.push(n.ticket);
      problema(n.ticket, "accion_desconocida", `La acción tiene que ser cancelar, quitar o mover; llegó ${JSON.stringify(r.accion)}.`);
    } else if (accion === "cancelar") {
      efectos.en_cascada.push(n.ticket);
    } else if (accion === "quitar") {
      efectos.quitadas.push({ tarea: n.ticket, de, relaciones });
    } else if (typeof r.a !== "string" || r.a.length === 0) {
      pendientes.push(n.ticket);
      problema(n.ticket, "falta_a", "`mover` necesita `a`: la clave de la tarea a la que pasa la dependencia.");
    } else {
      efectos.movidas.push({ tarea: n.ticket, de, relaciones, a: r.a });
    }
  }

  for (const [tarea] of porTarea) {
    const n = nodos.get(tarea);
    if (n === undefined) problema(tarea, "sobra", "No está en la cadena de esta cancelación.");
    else if (n.tipo === "otro_tablero") problema(tarea, "sobra", "Es de otro tablero: no se decide, se trata sola.");
    else if (!enJuego.has(n)) problema(tarea, "sobra", `No entra en juego: no se cancela ninguna de ${n.solo_si_cancelas.join(", ")}.`);
  }

  // Un `mover` con un `a` que no vale no se aplica: la tarea sigue pendiente.
  const deMover = problemasMover(efectos, nodos, canceladas, contexto);
  problemas.push(...deMover);
  const invalidas = new Set(deMover.map((p) => p.tarea));
  efectos.movidas = efectos.movidas.filter((m) => !invalidas.has(m.tarea));
  const sinResolver = new Set([...pendientes, ...invalidas]);
  const enOrden = cadena.filter((n): n is NodoDecidir => n.tipo === "decidir" && sinResolver.has(n.ticket)).map((n) => n.ticket);
  return { pendientes: enOrden, problemas, efectos };
}

function problemasMover(
  efectos: EfectosResoluciones,
  nodos: ReadonlyMap<string, NodoVisible>,
  canceladas: ReadonlySet<string>,
  contexto: ContextoResoluciones,
): ProblemaResolucion[] {
  const problemas: ProblemaResolucion[] = [];
  const validas: EfectoMover[] = [];
  for (const m of efectos.movidas) {
    const conocida = contexto.tareas?.[m.a];
    if (m.a === m.tarea) problemas.push({ tarea: m.tarea, problema: "a_es_ella_misma", detalle: "Una tarea no puede depender de sí misma." });
    else if (canceladas.has(m.a)) problemas.push({ tarea: m.tarea, problema: "a_se_cancela", detalle: `${m.a} se cancela en esta operación.` });
    else if (conocida?.estado === "cancelled") problemas.push({ tarea: m.tarea, problema: "a_cancelada", detalle: `${m.a} ya está cancelada.` });
    else if (contexto.tareas && !conocida && !nodos.has(m.a)) problemas.push({ tarea: m.tarea, problema: "a_no_existe", detalle: `${m.a} no existe.` });
    else validas.push(m);
  }
  if (validas.length === 0) return problemas;

  // Grafo tras aplicar: relaciones de la cadena y de contexto, sin las que se quitan, con las nuevas desde cada `a`.
  const quitadas = new Set<string>();
  for (const e of [...efectos.quitadas, ...efectos.movidas, ...efectos.otros_tableros]) {
    if ("relaciones" in e) for (const r of e.relaciones) quitadas.add(r);
  }
  const hijos = new Map<string, Set<string>>();
  const enlazar = (source: string, target: string) => {
    let s = hijos.get(source);
    if (!s) hijos.set(source, (s = new Set()));
    s.add(target);
  };
  for (const n of nodos.values()) for (const d of n.depende_de) if (!quitadas.has(d.relacion)) enlazar(d.ticket, n.ticket);
  for (const r of contexto.relaciones ?? []) enlazar(r.source, r.target);
  for (const m of validas) enlazar(m.a, m.tarea);

  for (const m of validas) {
    // a → tarea crea un ciclo si desde la tarea ya se llega a `a`.
    const vistas = new Set<string>([m.tarea]);
    const cola = [m.tarea];
    while (cola.length > 0 && !vistas.has(m.a)) {
      for (const h of hijos.get(cola.shift()!) ?? []) {
        if (!vistas.has(h)) {
          vistas.add(h);
          cola.push(h);
        }
      }
    }
    if (vistas.has(m.a)) problemas.push({ tarea: m.tarea, problema: "ciclo", detalle: `${m.a} ya depende de ${m.tarea}: moverla crearía un ciclo.` });
  }
  return problemas;
}

// ── Validadores ─────────────────────────────────────────────────────────────────────────────────────────────────

type Objeto = Record<string, unknown>;

function objeto(v: unknown): v is Objeto {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Objeto con exactamente estos campos (los `opcionales` pueden faltar). */
function campos(v: unknown, obligatorios: readonly string[], opcionales: readonly string[] = []): string | null {
  if (!objeto(v)) return "tiene que ser un objeto";
  const sobran = Object.keys(v).filter((k) => !obligatorios.includes(k) && !opcionales.includes(k));
  if (sobran.length > 0) return `campos no admitidos: ${sobran.join(", ")}`;
  const faltan = obligatorios.filter((k) => v[k] === undefined);
  return faltan.length > 0 ? `faltan campos: ${faltan.join(", ")}` : null;
}

const texto = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const clave = (v: unknown): v is string => typeof v === "string" && CLAVE_TAREA.test(v);
const natural = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const textoONulo = (v: unknown) => v === null || texto(v);
const listaDe = (v: unknown, f: (x: unknown) => boolean) => Array.isArray(v) && v.every(f);
const sinRepetir = (v: readonly unknown[]) => new Set(v).size === v.length;

export function esAccionResolucion(v: unknown): v is AccionResolucion {
  return typeof v === "string" && (ACCIONES_RESOLUCION as readonly string[]).includes(v);
}

/**
 * Motivo de una cancelación con dependientes: de `MOTIVO_MIN` a `MOTIVO_MAX` caracteres (puntos de código, como cuenta
 * JSON Schema) y no solo blancos.
 */
export function errorMotivoCancelar(v: unknown): string | null {
  if (typeof v !== "string" || v.trim().length === 0) return "motivo tiene que ser un texto no vacío";
  const n = [...v].length;
  return n >= MOTIVO_MIN && n <= MOTIVO_MAX ? null : `motivo tiene que tener de ${MOTIVO_MIN} a ${MOTIVO_MAX} caracteres`;
}

/** Una resolución bien formada. Una acción sin elegir (`"elige: …"`) no pasa. */
export function errorResolucion(v: unknown): string | null {
  const e = campos(v, ["tarea", "accion"], ["a"]);
  if (e) return e;
  const r = v as Objeto;
  if (!clave(r.tarea)) return "tarea tiene que ser la clave de una tarea (SF-123)";
  if (!esAccionResolucion(r.accion)) return `accion tiene que ser cancelar, quitar o mover; llegó ${JSON.stringify(r.accion)}`;
  if (r.a !== undefined && !clave(r.a)) return "a tiene que ser la clave de una tarea (SF-123)";
  return null;
}

export function errorResoluciones(v: unknown): string | null {
  if (!Array.isArray(v)) return "resoluciones tiene que ser una lista";
  for (const [i, r] of v.entries()) {
    const e = errorResolucion(r);
    if (e) return `resoluciones[${i}]: ${e}`;
  }
  return sinRepetir(v.map((r) => (r as Objeto).tarea)) ? null : "resoluciones: una sola por tarea";
}

export function errorPeticionCancelar(v: unknown): string | null {
  const e = campos(v, [], ["motivo", "resoluciones", "actor", "firma", "lote"]);
  if (e) return e;
  const p = v as Objeto;
  if (p.motivo !== undefined) {
    const em = errorMotivoCancelar(p.motivo);
    if (em) return em;
  }
  if (p.resoluciones !== undefined) {
    const er = errorResoluciones(p.resoluciones);
    if (er) return er;
  }
  if (p.actor !== undefined && !(typeof p.actor === "string" && ACTOR.test(p.actor))) return "actor tiene que ser un id del grafo";
  if (p.firma !== undefined && !texto(p.firma)) return "firma tiene que ser un texto no vacío";
  if (p.lote !== undefined && !(listaDe(p.lote, texto) && (p.lote as unknown[]).length > 0)) return "lote tiene que ser una lista no vacía de tareas";
  return null;
}

export function errorProblemaResolucion(v: unknown): string | null {
  const e = campos(v, ["tarea", "problema", "detalle"]);
  if (e) return e;
  const p = v as Objeto;
  if (!texto(p.tarea)) return "tarea tiene que ser un texto no vacío";
  // Un `problema` desconocido se acepta como texto: el catálogo puede crecer.
  if (!texto(p.problema)) return "problema tiene que ser un texto no vacío";
  return texto(p.detalle) ? null : "detalle tiene que ser un texto no vacío";
}

const CAMPOS_VISIBLE = ["ticket", "titulo", "tablero", "estado", "nivel", "depende_de", "tipo", "solo_si_cancelas", "responsable"];

export function errorNodoCadena(v: unknown): string | null {
  if (!objeto(v)) return "tiene que ser un objeto";
  const tipo = v.tipo;
  const e =
    tipo === "decidir"
      ? campos(v, [...CAMPOS_VISIBLE, "opciones", "cuelgan", "asignado", "automatica", "rutina_activa", "en_curso"])
      : tipo === "otro_tablero"
        ? campos(v, [...CAMPOS_VISIBLE, "automatico"])
        : tipo === "oculta"
          ? campos(v, ["tipo", "tablero", "nivel", "solo_si_cancelas"])
          : `tipo tiene que ser ${TIPOS_NODO_CADENA.join(", ")}`;
  if (e) return e;
  if (!texto(v.tablero)) return "tablero tiene que ser un texto no vacío";
  if (!(natural(v.nivel) && v.nivel >= 1)) return "nivel tiene que ser un entero >= 1";
  if (!listaDe(v.solo_si_cancelas, clave) || !sinRepetir(v.solo_si_cancelas as unknown[])) return "solo_si_cancelas tiene que ser una lista de claves sin repetir";
  if (tipo === "oculta") return null;
  if (!clave(v.ticket)) return "ticket tiene que ser una clave de tarea";
  if (typeof v.titulo !== "string") return "titulo tiene que ser texto";
  if (!texto(v.estado)) return "estado tiene que ser el slug de una columna";
  if (v.estado === "done" || v.estado === "cancelled") return "solo cuentan las dependientes abiertas";
  if (!textoONulo(v.responsable)) return "responsable tiene que ser un id del grafo o null";
  if (!Array.isArray(v.depende_de) || v.depende_de.length === 0) return "depende_de tiene que ser una lista no vacía";
  for (const [i, d] of v.depende_de.entries()) {
    const ed = campos(d, ["ticket", "relacion"]);
    if (ed) return `depende_de[${i}]: ${ed}`;
    if (!clave((d as Objeto).ticket) || !texto((d as Objeto).relacion)) return `depende_de[${i}]: ticket o relacion no válidos`;
  }
  const padres = (v.depende_de as DependenciaNodo[]).map((d) => d.ticket);
  if (!sinRepetir(padres)) return "depende_de: una relación por tarea";
  const ssc = v.solo_si_cancelas as string[];
  if (!ssc.every((t) => padres.includes(t))) return "solo_si_cancelas solo lleva tareas de depende_de";
  if (tipo === "otro_tablero") return texto(v.automatico) ? null : "automatico tiene que ser un texto no vacío";
  if (!(listaDe(v.opciones, esAccionResolucion) && sinRepetir(v.opciones as unknown[]) && (v.opciones as unknown[]).length > 0)) {
    return "opciones tiene que ser una lista de acciones sin repetir";
  }
  if (!natural(v.cuelgan)) return "cuelgan tiene que ser un entero >= 0";
  if (!textoONulo(v.asignado)) return "asignado tiene que ser texto o null";
  for (const k of ["automatica", "rutina_activa", "en_curso"] as const) if (typeof v[k] !== "boolean") return `${k} tiene que ser booleano`;
  return null;
}

/** Comprueba la cadena entera: nodos únicos, ordenados por nivel, y sus referencias dentro de la cadena. */
function errorCadena(cadena: unknown[], raiz: string): string | null {
  for (const [i, n] of cadena.entries()) {
    const e = errorNodoCadena(n);
    if (e) return `cadena[${i}]: ${e}`;
  }
  const nodos = cadena as NodoCadena[];
  const vis = nodos.filter(visible);
  const claves = new Set(vis.map((n) => n.ticket));
  if (claves.size !== vis.length) return "cadena: cada tarea sale una sola vez";
  if (claves.has(raiz)) return "cadena: la raíz no es un nodo de su propia cadena";
  for (let i = 1; i < nodos.length; i++) if (nodos[i]!.nivel < nodos[i - 1]!.nivel) return "cadena: los nodos van ordenados por nivel";
  const decidir = new Set(vis.filter((n) => n.tipo === "decidir").map((n) => n.ticket));
  for (const n of nodos) {
    for (const t of n.solo_si_cancelas) {
      const padre = vis.find((p) => p.ticket === t);
      if (!padre) return `cadena: ${t} (solo_si_cancelas) no está en la cadena`;
      if (padre.tipo !== "decidir") return `cadena: ${t} no es de este tablero; no se baja por él`;
      if (padre.nivel >= n.nivel) return `cadena: un nodo que depende de ${t} tiene que ir a un nivel mayor`;
    }
    if (visible(n)) {
      for (const d of n.depende_de) {
        if (d.ticket === raiz) continue;
        if (!decidir.has(d.ticket)) return `cadena: ${n.ticket} depende de ${d.ticket}, que no es la raíz ni un nodo decidir`;
        if (vis.find((p) => p.ticket === d.ticket)!.nivel >= n.nivel) return `cadena: ${n.ticket} tiene que ir a un nivel mayor que ${d.ticket}`;
      }
      const directa = n.depende_de.some((d) => d.ticket === raiz);
      const esperada = directa ? [] : n.depende_de.map((d) => d.ticket);
      if ([...n.solo_si_cancelas].sort().join() !== [...esperada].sort().join()) return `cadena: solo_si_cancelas de ${n.ticket} no cuadra con depende_de`;
    }
  }
  return null;
}

export function errorErrorDependenciasSinResolver(v: unknown): string | null {
  const e = campos(v, ["error", "message", "details"]);
  if (e) return e;
  const r = v as Objeto;
  if (r.error !== ERROR_DEPENDENCIAS_SIN_RESOLVER) return `error tiene que ser ${ERROR_DEPENDENCIAS_SIN_RESOLVER}`;
  if (!texto(r.message)) return "message tiene que ser un texto no vacío";
  const d = r.details;
  const ed = campos(d, ["tarea", "motivo", "total", "truncada", "cadena", "pendientes", "problemas", "opciones", "otros_tableros", "ejemplo_resoluciones", "a_mano"], ["llamada"]);
  if (ed) return `details: ${ed}`;
  const det = d as Objeto;
  const et = campos(det.tarea, ["ticket", "titulo", "tablero"]);
  if (et) return `details.tarea: ${et}`;
  const tarea = det.tarea as Objeto;
  if (!clave(tarea.ticket) || typeof tarea.titulo !== "string" || !texto(tarea.tablero)) return "details.tarea: ticket, titulo o tablero no válidos";
  const em = campos(det.motivo, ["requerido", "recibido"]);
  if (em) return `details.motivo: ${em}`;
  if (typeof (det.motivo as Objeto).requerido !== "boolean" || typeof (det.motivo as Objeto).recibido !== "boolean") return "details.motivo: requerido y recibido son booleanos";
  if (!Array.isArray(det.cadena)) return "details.cadena tiene que ser una lista";
  if (det.cadena.length > MAX_NODOS_CADENA) return `details.cadena: como mucho ${MAX_NODOS_CADENA} nodos`;
  if (!natural(det.total) || det.total < det.cadena.length) return "details.total tiene que ser un entero >= los nodos de la cadena";
  if (typeof det.truncada !== "boolean") return "details.truncada tiene que ser booleano";
  if (det.truncada !== det.total > det.cadena.length) return "details.truncada: solo cuando total supera los nodos devueltos";
  const ec = errorCadena(det.cadena, tarea.ticket as string);
  if (ec) return `details.${ec}`;
  const decidir = new Set((det.cadena as NodoCadena[]).filter((n) => n.tipo === "decidir").map((n) => (n as NodoDecidir).ticket));
  if (!listaDe(det.pendientes, clave) || !sinRepetir(det.pendientes as unknown[])) return "details.pendientes tiene que ser una lista de claves sin repetir";
  if (det.cadena.length === 0) return "details.cadena no puede estar vacía: sin dependientes no hay 409";
  if (!(det.pendientes as string[]).every((t) => decidir.has(t) || det.truncada)) return "details.pendientes: solo nodos decidir de la cadena";
  if (!Array.isArray(det.problemas)) return "details.problemas tiene que ser una lista";
  for (const [i, p] of det.problemas.entries()) {
    const ep = errorProblemaResolucion(p);
    if (ep) return `details.problemas[${i}]: ${ep}`;
  }
  const eo = campos(det.opciones, [...ACCIONES_RESOLUCION]);
  if (eo) return `details.opciones: ${eo}`;
  if (!ACCIONES_RESOLUCION.every((a) => texto((det.opciones as Objeto)[a]))) return "details.opciones: un texto por acción";
  if (!texto(det.otros_tableros)) return "details.otros_tableros tiene que ser un texto no vacío";
  if (!Array.isArray(det.ejemplo_resoluciones)) return "details.ejemplo_resoluciones tiene que ser una lista";
  for (const [i, ej] of det.ejemplo_resoluciones.entries()) {
    const ee = campos(ej, ["tarea", "accion"], ["a"]);
    if (ee) return `details.ejemplo_resoluciones[${i}]: ${ee}`;
    const x = ej as Objeto;
    if (!clave(x.tarea) || !texto(x.accion) || (x.a !== undefined && !texto(x.a))) return `details.ejemplo_resoluciones[${i}]: tarea, accion o a no válidos`;
    if (esAccionResolucion(x.accion)) return `details.ejemplo_resoluciones[${i}]: la acción va sin elegir`;
  }
  const ejemplo = (det.ejemplo_resoluciones as Objeto[]).map((x) => x.tarea);
  if (ejemplo.join() !== (det.pendientes as string[]).join()) return "details.ejemplo_resoluciones: una entrada por pendiente, en su orden";
  if (det.llamada !== undefined) {
    const el = campos(det.llamada, ["herramienta", "argumentos"]);
    if (el) return `details.llamada: ${el}`;
    if (!texto((det.llamada as Objeto).herramienta) || !objeto((det.llamada as Objeto).argumentos)) return "details.llamada: herramienta o argumentos no válidos";
  }
  return texto(det.a_mano) ? null : "details.a_mano tiene que ser un texto no vacío";
}

export function errorErrorCancelarSinPermiso(v: unknown): string | null {
  const e = campos(v, ["error", "message", "details"]);
  if (e) return e;
  const r = v as Objeto;
  if (r.error !== ERROR_CANCELAR_SIN_PERMISO) return `error tiene que ser ${ERROR_CANCELAR_SIN_PERMISO}`;
  if (!texto(r.message)) return "message tiene que ser un texto no vacío";
  const ed = campos(r.details, ["tareas"]);
  if (ed) return `details: ${ed}`;
  const tareas = (r.details as Objeto).tareas;
  if (!Array.isArray(tareas) || tareas.length === 0) return "details.tareas tiene que ser una lista no vacía";
  for (const [i, t] of tareas.entries()) {
    const et = campos(t, ["tarea", "falta"]);
    if (et) return `details.tareas[${i}]: ${et}`;
    if (!clave((t as Objeto).tarea) || !texto((t as Objeto).falta)) return `details.tareas[${i}]: tarea o falta no válidos`;
  }
  return null;
}

function errorMovidas(v: unknown): string | null {
  if (!Array.isArray(v)) return "movidas tiene que ser una lista";
  for (const [i, m] of v.entries()) {
    const e = campos(m, ["tarea", "de", "a"]);
    if (e) return `movidas[${i}]: ${e}`;
    const x = m as Objeto;
    if (!clave(x.tarea) || !clave(x.a) || !listaDe(x.de, clave) || (x.de as unknown[]).length === 0) return `movidas[${i}]: tarea, de o a no válidos`;
    if (x.a === x.tarea) return `movidas[${i}]: a no puede ser la propia tarea`;
  }
  return null;
}

/** Lo común a la respuesta `200` y al evento: canceladas (con la raíz primero), quitadas y movidas sin solaparse. */
function errorEfectosResultado(r: Objeto, raiz?: string): string | null {
  if (!listaDe(r.canceladas, clave) || (r.canceladas as unknown[]).length === 0) return "canceladas tiene que ser una lista no vacía de claves";
  if (raiz !== undefined && (r.canceladas as string[])[0] !== raiz) return "canceladas empieza por la raíz";
  if (!listaDe(r.quitadas, clave)) return "quitadas tiene que ser una lista de claves";
  const em = errorMovidas(r.movidas);
  if (em) return em;
  const todas = [...(r.canceladas as string[]), ...(r.quitadas as string[]), ...(r.movidas as MovidaCancelar[]).map((m) => m.tarea)];
  if (!sinRepetir(todas)) return "cada tarea sale una sola vez entre canceladas, quitadas y movidas";
  const canceladas = new Set(r.canceladas as string[]);
  if ((r.movidas as MovidaCancelar[]).some((m) => canceladas.has(m.a))) return "movidas: a no puede ser una tarea cancelada";
  return null;
}

export function errorResultadoCancelar(v: unknown): string | null {
  const e = campos(v, ["canceladas", "quitadas", "movidas", "otros_tableros", "comentarios"]);
  if (e) return e;
  const r = v as Objeto;
  const ee = errorEfectosResultado(r);
  if (ee) return ee;
  if (!Array.isArray(r.otros_tableros)) return "otros_tableros tiene que ser una lista";
  for (const [i, o] of r.otros_tableros.entries()) {
    const eo = objeto(o) && o.oculta !== undefined ? campos(o, ["oculta", "tablero"]) : campos(o, ["tarea", "responsable"]);
    if (eo) return `otros_tableros[${i}]: ${eo}`;
    const x = o as Objeto;
    const ok = x.oculta !== undefined ? x.oculta === true && texto(x.tablero) : clave(x.tarea) && textoONulo(x.responsable);
    if (!ok) return `otros_tableros[${i}]: campos no válidos`;
  }
  return natural(r.comentarios) ? null : "comentarios tiene que ser un entero >= 0";
}

export function errorEventoCanceladaConDependientes(v: unknown): string | null {
  const e = campos(v, ["raiz", "actor", "motivo", "canceladas", "quitadas", "movidas", "otros_tableros", "en"]);
  if (e) return e;
  const r = v as Objeto;
  if (!clave(r.raiz)) return "raiz tiene que ser una clave de tarea";
  if (typeof r.actor !== "string" || !ACTOR.test(r.actor)) return "actor tiene que ser un id del grafo";
  const em = errorMotivoCancelar(r.motivo);
  if (em) return em;
  const ee = errorEfectosResultado(r, r.raiz);
  if (ee) return ee;
  if (!Array.isArray(r.otros_tableros)) return "otros_tableros tiene que ser una lista";
  for (const [i, o] of r.otros_tableros.entries()) {
    const eo = campos(o, ["tarea", "proyecto", "responsable"]);
    if (eo) return `otros_tableros[${i}]: ${eo}`;
    const x = o as Objeto;
    if (!clave(x.tarea) || !texto(x.proyecto) || !textoONulo(x.responsable)) return `otros_tableros[${i}]: campos no válidos`;
  }
  return typeof r.en === "string" && FECHA_ISO.test(r.en) && !Number.isNaN(Date.parse(r.en)) ? null : "en tiene que ser una fecha ISO 8601 UTC";
}

export const VALIDADORES_CANCELAR = {
  peticion: errorPeticionCancelar,
  error_dependencias: errorErrorDependenciasSinResolver,
  error_permiso: errorErrorCancelarSinPermiso,
  resultado: errorResultadoCancelar,
  evento: errorEventoCanceladaConDependientes,
} as const satisfies Record<string, (v: unknown) => string | null>;
export type TipoMensajeCancelar = keyof typeof VALIDADORES_CANCELAR;

/** `null` si `valor` cumple el contrato del mensaje `tipo`; si no, el motivo. */
export function validarCancelar(tipo: string, valor: unknown): string | null {
  if (!Object.hasOwn(VALIDADORES_CANCELAR, tipo)) return `tipo de mensaje desconocido: ${tipo}`;
  return VALIDADORES_CANCELAR[tipo as TipoMensajeCancelar](valor);
}

// ── Esquema JSON (`testing/contratos/muestras/cancelar-con-dependientes/esquema.json`) ─────────────────────────

const S_CLAVE = { type: "string", pattern: CLAVE_TAREA.source } as const;
const S_TEXTO = { type: "string", minLength: 1 } as const;
const S_MOTIVO = { type: "string", minLength: MOTIVO_MIN, maxLength: MOTIVO_MAX, pattern: "\\S" } as const;
const S_TEXTO_O_NULO = { type: ["string", "null"] } as const;
const S_NATURAL = { type: "integer", minimum: 0 } as const;
const S_CLAVES = { type: "array", items: S_CLAVE } as const;
const S_ACCION = { enum: [...ACCIONES_RESOLUCION] } as const;
const S_MOVIDAS = {
  type: "array",
  items: {
    type: "object",
    properties: { tarea: S_CLAVE, de: { ...S_CLAVES, minItems: 1 }, a: S_CLAVE },
    required: ["tarea", "de", "a"],
    additionalProperties: false,
  },
} as const;
const VISIBLE_PROPS = {
  ticket: S_CLAVE,
  titulo: { type: "string" },
  tablero: S_TEXTO,
  estado: { type: "string", minLength: 1, not: { enum: ["done", "cancelled"] } },
  nivel: { type: "integer", minimum: 1 },
  depende_de: {
    type: "array",
    minItems: 1,
    items: {
      type: "object",
      properties: { ticket: S_CLAVE, relacion: S_TEXTO },
      required: ["ticket", "relacion"],
      additionalProperties: false,
    },
  },
  solo_si_cancelas: { ...S_CLAVES, uniqueItems: true },
  responsable: S_TEXTO_O_NULO,
} as const;

/**
 * Esquema JSON (draft 2020-12) de los mensajes del contrato, para que el fork, que es otro repositorio, valide sus
 * respuestas reales. Comprueba la forma; las reglas entre campos (orden, referencias, pendientes) son de los validadores.
 * Cada mensaje está en `$defs` con el nombre de `VALIDADORES_CANCELAR`.
 */
export const ESQUEMA_CANCELAR_CON_DEPENDIENTES = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/intelia-technologies/software-factory/testing/contratos/muestras/cancelar-con-dependientes/esquema.json",
  title: "Cancelar con dependientes (diseño 82)",
  $defs: {
    resolucion: {
      type: "object",
      properties: { tarea: S_CLAVE, accion: S_ACCION, a: S_CLAVE },
      required: ["tarea", "accion"],
      additionalProperties: false,
    },
    problema: {
      type: "object",
      properties: {
        tarea: S_TEXTO,
        problema: { type: "string", minLength: 1, description: `Conocidos: ${PROBLEMAS_RESOLUCION.join(", ")}. Uno nuevo se lee como texto.` },
        detalle: S_TEXTO,
      },
      required: ["tarea", "problema", "detalle"],
      additionalProperties: false,
    },
    nodo: {
      oneOf: [
        {
          type: "object",
          properties: {
            ...VISIBLE_PROPS,
            tipo: { const: "decidir" },
            opciones: { type: "array", items: S_ACCION, minItems: 1, uniqueItems: true },
            cuelgan: S_NATURAL,
            asignado: S_TEXTO_O_NULO,
            automatica: { type: "boolean" },
            rutina_activa: { type: "boolean" },
            en_curso: { type: "boolean" },
          },
          required: [...CAMPOS_VISIBLE, "opciones", "cuelgan", "asignado", "automatica", "rutina_activa", "en_curso"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: { ...VISIBLE_PROPS, tipo: { const: "otro_tablero" }, automatico: S_TEXTO },
          required: [...CAMPOS_VISIBLE, "automatico"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            tipo: { const: "oculta" },
            tablero: S_TEXTO,
            nivel: { type: "integer", minimum: 1 },
            solo_si_cancelas: { ...S_CLAVES, uniqueItems: true },
          },
          required: ["tipo", "tablero", "nivel", "solo_si_cancelas"],
          additionalProperties: false,
        },
      ],
    },
    peticion: {
      type: "object",
      properties: {
        motivo: S_MOTIVO,
        resoluciones: { type: "array", items: { $ref: "#/$defs/resolucion" } },
        actor: { type: "string", pattern: ACTOR.source },
        firma: S_TEXTO,
        lote: { type: "array", items: S_TEXTO, minItems: 1 },
      },
      additionalProperties: false,
    },
    error_dependencias: {
      type: "object",
      properties: {
        error: { const: ERROR_DEPENDENCIAS_SIN_RESOLVER },
        message: S_TEXTO,
        details: {
          type: "object",
          properties: {
            tarea: {
              type: "object",
              properties: { ticket: S_CLAVE, titulo: { type: "string" }, tablero: S_TEXTO },
              required: ["ticket", "titulo", "tablero"],
              additionalProperties: false,
            },
            motivo: {
              type: "object",
              properties: { requerido: { type: "boolean" }, recibido: { type: "boolean" } },
              required: ["requerido", "recibido"],
              additionalProperties: false,
            },
            total: S_NATURAL,
            truncada: { type: "boolean" },
            cadena: { type: "array", items: { $ref: "#/$defs/nodo" }, maxItems: MAX_NODOS_CADENA },
            pendientes: { ...S_CLAVES, uniqueItems: true },
            problemas: { type: "array", items: { $ref: "#/$defs/problema" } },
            opciones: {
              type: "object",
              properties: { cancelar: S_TEXTO, quitar: S_TEXTO, mover: S_TEXTO },
              required: [...ACCIONES_RESOLUCION],
              additionalProperties: false,
            },
            otros_tableros: S_TEXTO,
            ejemplo_resoluciones: {
              type: "array",
              items: {
                type: "object",
                properties: { tarea: S_CLAVE, accion: { type: "string", minLength: 1, not: S_ACCION }, a: S_TEXTO },
                required: ["tarea", "accion"],
                additionalProperties: false,
              },
            },
            llamada: {
              type: "object",
              properties: { herramienta: S_TEXTO, argumentos: { type: "object" } },
              required: ["herramienta", "argumentos"],
              additionalProperties: false,
            },
            a_mano: S_TEXTO,
          },
          required: ["tarea", "motivo", "total", "truncada", "cadena", "pendientes", "problemas", "opciones", "otros_tableros", "ejemplo_resoluciones", "a_mano"],
          additionalProperties: false,
        },
      },
      required: ["error", "message", "details"],
      additionalProperties: false,
    },
    error_permiso: {
      type: "object",
      properties: {
        error: { const: ERROR_CANCELAR_SIN_PERMISO },
        message: S_TEXTO,
        details: {
          type: "object",
          properties: {
            tareas: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                properties: { tarea: S_CLAVE, falta: S_TEXTO },
                required: ["tarea", "falta"],
                additionalProperties: false,
              },
            },
          },
          required: ["tareas"],
          additionalProperties: false,
        },
      },
      required: ["error", "message", "details"],
      additionalProperties: false,
    },
    resultado: {
      type: "object",
      properties: {
        canceladas: { ...S_CLAVES, minItems: 1 },
        quitadas: S_CLAVES,
        movidas: S_MOVIDAS,
        otros_tableros: {
          type: "array",
          items: {
            oneOf: [
              {
                type: "object",
                properties: { tarea: S_CLAVE, responsable: S_TEXTO_O_NULO },
                required: ["tarea", "responsable"],
                additionalProperties: false,
              },
              {
                type: "object",
                properties: { oculta: { const: true }, tablero: S_TEXTO },
                required: ["oculta", "tablero"],
                additionalProperties: false,
              },
            ],
          },
        },
        comentarios: S_NATURAL,
      },
      required: ["canceladas", "quitadas", "movidas", "otros_tableros", "comentarios"],
      additionalProperties: false,
    },
    evento: {
      type: "object",
      properties: {
        raiz: S_CLAVE,
        actor: { type: "string", pattern: ACTOR.source },
        motivo: S_MOTIVO,
        canceladas: { ...S_CLAVES, minItems: 1 },
        quitadas: S_CLAVES,
        movidas: S_MOVIDAS,
        otros_tableros: {
          type: "array",
          items: {
            type: "object",
            properties: { tarea: S_CLAVE, proyecto: S_TEXTO, responsable: S_TEXTO_O_NULO },
            required: ["tarea", "proyecto", "responsable"],
            additionalProperties: false,
          },
        },
        en: { type: "string", pattern: FECHA_ISO.source },
      },
      required: ["raiz", "actor", "motivo", "canceladas", "quitadas", "movidas", "otros_tableros", "en"],
      additionalProperties: false,
    },
  },
} as const;
