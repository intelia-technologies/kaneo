/**
 * PZ-01: contrato de la pausa de ámbito (diseño 81 §4.2). Lo comparten el fork de Kaneo (PZ-03, que guarda la pausa y
 * sirve su JSON), el despachador (PZ-05 a PZ-07, que la lee y la respeta) y el gateway (PZ-08, `kaneo.pausa`).
 *
 * El fork habla en inglés (`scopeType`, `pausedAt`…) salvo los campos que ya nacen en castellano en su tabla
 * (`motivo`, `revisarEl`, `notaReanudar`); las piezas de la factoría trabajan con los tipos en castellano de aquí. La
 * traducción valida: una pausa sin motivo o sin `revisarEl` no se acepta, venga de donde venga.
 */

/** Capacidad que anuncia el despachador en `/health` cuando respeta las pausas (decisión 16). */
export const CAPACIDAD_PAUSA_AMBITO = "pausa-ambito" as const;

/** Errores de la pausa de ámbito, del fork (`PAUSA_YA_ACTIVA`) y del gateway (el resto). */
export const PAUSA_YA_ACTIVA = "PAUSA_YA_ACTIVA" as const;
export const PAUSA_REVISAR_EL_REQUERIDA = "PAUSA_REVISAR_EL_REQUERIDA" as const;
export const PAUSA_REVISAR_EL_PASADA = "PAUSA_REVISAR_EL_PASADA" as const;
export const PAUSA_MOTIVO_REQUERIDO = "PAUSA_MOTIVO_REQUERIDO" as const;
export const PAUSAS_NO_SOPORTADAS = "PAUSAS_NO_SOPORTADAS" as const;
export const TAREA_EN_PAUSA = "TAREA_EN_PAUSA" as const;
export const CODIGOS_ERROR_PAUSA = [
  PAUSA_YA_ACTIVA,
  PAUSA_REVISAR_EL_REQUERIDA,
  PAUSA_REVISAR_EL_PASADA,
  PAUSA_MOTIVO_REQUERIDO,
  PAUSAS_NO_SOPORTADAS,
  TAREA_EN_PAUSA,
] as const;
export type CodigoErrorPausa = (typeof CODIGOS_ERROR_PAUSA)[number];

/** Límites del motivo, tras `trim()` (§4.1: de 3 a 500 caracteres). */
export const MIN_MOTIVO_PAUSA = 3;
export const MAX_MOTIVO_PAUSA = 500;

export const TIPOS_AMBITO_PAUSA = ["proyecto", "iniciativa"] as const;
export type TipoAmbitoPausa = (typeof TIPOS_AMBITO_PAUSA)[number];

export interface AmbitoPausa {
  tipo: TipoAmbitoPausa;
  /** Id de Kaneo del proyecto o de la iniciativa. */
  id: string;
  nombre: string;
  /** Proyecto de casa: el mismo `id` si el ámbito es un proyecto; el de la iniciativa, si es una iniciativa. */
  proyectoId: string;
}

/** Quién: el id del grafo (`agent:forja`) y la cuenta de Kaneo que hizo la llamada. Puede faltar uno, nunca los dos. */
export interface ActorPausa {
  actor: string | null;
  usuario: string | null;
}

export interface PausaAmbito {
  id: string;
  ambito: AmbitoPausa;
  /** Solo en una iniciativa: sus tareas de `task_initiative`, de todos los proyectos. */
  tareas?: string[];
  motivo: string;
  /** Fecha `AAAA-MM-DD` (Europe/Madrid) en la que se avisa a quien pausó; la pausa no se levanta sola. */
  revisarEl: string;
  pausadaPor: ActorPausa;
  /** ISO 8601. */
  pausadaEn: string;
  reanudadaPor?: ActorPausa;
  /** ISO 8601; presente = la pausa ya no está activa. */
  reanudadaEn?: string;
  notaReanudar?: string;
}

/** Respuesta de `GET /workspace/{ws}/scope-pauses`, ya traducida. */
export interface PausasVigentes {
  pausas: PausaAmbito[];
  calculadoEn: string;
}

export const TIPOS_CAMBIO_PAUSA = ["creada", "cambiada", "reanudada"] as const;
export type TipoCambioPausa = (typeof TIPOS_CAMBIO_PAUSA)[number];

/** Una fila del historial (`scope_pause_change`), ya traducida. */
export interface CambioPausaAmbito {
  id: string;
  pausaId: string;
  tipo: TipoCambioPausa;
  anterior: Record<string, unknown> | null;
  valor: Record<string, unknown>;
  hechoPor: ActorPausa;
  /** Por dónde llegó: `gateway`, `web`, `api`… El lector no lo interpreta. */
  origen: string | null;
  en: string;
}

// ── JSON del fork ────────────────────────────────────────────────────────────────────────────────────────────────

/** Una pausa tal como la sirve el fork (`/api/intelia/…/pause`, `/scope-pause/{id}`, `/scope-pauses`). */
export interface PausaAmbitoFork {
  id: string;
  workspaceId: string;
  scopeType: "project" | "initiative";
  /** Proyecto de casa: el pausado, o el de la iniciativa. */
  projectId: string;
  /** Solo con `scopeType = initiative`; `null` en un proyecto. */
  initiativeId: string | null;
  scopeName: string;
  /** Solo con `scopeType = initiative`: tareas de la iniciativa en todos los proyectos. */
  taskIds?: string[];
  motivo: string;
  revisarEl: string;
  pausedByUserId: string | null;
  pausedByActor: string | null;
  pausedAt: string;
  resumedByUserId: string | null;
  resumedByActor: string | null;
  resumedAt: string | null;
  notaReanudar: string | null;
}

export interface PausasVigentesFork {
  pausas: PausaAmbitoFork[];
  calculadoEn: string;
}

/** Una fila del historial tal como la sirve `GET /scope-pause/{id}/history` (un array en orden). */
export interface CambioPausaAmbitoFork {
  id: string;
  pauseId: string;
  kind: "created" | "updated" | "resumed";
  previous: Record<string, unknown> | null;
  value: Record<string, unknown>;
  userId: string | null;
  actor: string | null;
  source: string | null;
  createdAt: string;
}

/** Resultado de traducir y validar: nunca lanza. */
export type LecturaPausa<T> =
  | { ok: true; valor: T }
  | { ok: false; error: string };

// ── Validación ───────────────────────────────────────────────────────────────────────────────────────────────────

const FECHA_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `AAAA-MM-DD` de un día que existe (rechaza `2026-02-30`). */
export function esFechaDia(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const m = FECHA_DIA.exec(valor);
  if (!m) return false;
  const fecha = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
  );
  return fecha.toISOString().slice(0, 10) === valor;
}

function esInstante(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    valor.length > 0 &&
    !Number.isNaN(Date.parse(valor))
  );
}

function esId(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length > 0;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function idOpcional(valor: unknown): valor is string | null | undefined {
  return valor === null || valor === undefined || esId(valor);
}

/** El día de hoy en Europe/Madrid, `AAAA-MM-DD`: con él se compara `revisarEl`. */
export function hoyEnMadrid(ahora: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/**
 * Valida el motivo y `revisarEl` de `pausar` y `cambiar` (§4.4). `hoy` es `hoyEnMadrid(ahora)`: `revisarEl` tiene que
 * ser posterior. En `cambiar`, los ausentes no se validan (`parcial`). Devuelve el código del 400 o `null`.
 */
export function errorPeticionPausa(
  peticion: { motivo?: unknown; revisarEl?: unknown },
  hoy: string,
  parcial = false,
): CodigoErrorPausa | null {
  if (!parcial || peticion.motivo !== undefined) {
    const motivo =
      typeof peticion.motivo === "string" ? peticion.motivo.trim() : "";
    if (motivo.length < MIN_MOTIVO_PAUSA || motivo.length > MAX_MOTIVO_PAUSA)
      return PAUSA_MOTIVO_REQUERIDO;
  }
  if (!parcial || peticion.revisarEl !== undefined) {
    if (!esFechaDia(peticion.revisarEl)) return PAUSA_REVISAR_EL_REQUERIDA;
    if (peticion.revisarEl <= hoy) return PAUSA_REVISAR_EL_PASADA;
  }
  return null;
}

function actor(
  usuario: unknown,
  idActor: unknown,
  campo: string,
): LecturaPausa<ActorPausa> {
  if (!idOpcional(usuario) || !idOpcional(idActor))
    return { ok: false, error: `${campo}: usuario o actor no es un id` };
  const a = { actor: idActor ?? null, usuario: usuario ?? null };
  if (a.actor === null && a.usuario === null)
    return { ok: false, error: `${campo}: sin usuario ni actor` };
  return { ok: true, valor: a };
}

/** Traduce y valida una pausa del fork. Los campos que el contrato no conoce se ignoran. */
export function traducirPausaAmbitoFork(
  entrada: unknown,
): LecturaPausa<PausaAmbito> {
  if (!esObjeto(entrada)) return { ok: false, error: "pausa: no es un objeto" };
  const p = entrada;
  if (!esId(p.id)) return { ok: false, error: "pausa: falta id" };
  const donde = `pausa ${p.id}`;
  if (p.scopeType !== "project" && p.scopeType !== "initiative")
    return { ok: false, error: `${donde}: scopeType inválido` };
  if (!esId(p.projectId))
    return { ok: false, error: `${donde}: falta projectId` };
  if (typeof p.scopeName !== "string" || !p.scopeName.trim())
    return { ok: false, error: `${donde}: falta scopeName` };
  if (
    typeof p.motivo !== "string" ||
    p.motivo.trim().length < MIN_MOTIVO_PAUSA ||
    p.motivo.trim().length > MAX_MOTIVO_PAUSA
  ) {
    return { ok: false, error: `${donde}: ${PAUSA_MOTIVO_REQUERIDO}` };
  }
  if (!esFechaDia(p.revisarEl))
    return { ok: false, error: `${donde}: ${PAUSA_REVISAR_EL_REQUERIDA}` };
  if (!esInstante(p.pausedAt))
    return { ok: false, error: `${donde}: pausedAt inválido` };

  let ambito: AmbitoPausa;
  let tareas: string[] | undefined;
  if (p.scopeType === "project") {
    if (p.initiativeId !== null && p.initiativeId !== undefined)
      return {
        ok: false,
        error: `${donde}: un proyecto no lleva initiativeId`,
      };
    if (p.taskIds !== undefined)
      return { ok: false, error: `${donde}: un proyecto no lleva taskIds` };
    ambito = {
      tipo: "proyecto",
      id: p.projectId,
      nombre: p.scopeName,
      proyectoId: p.projectId,
    };
  } else {
    if (!esId(p.initiativeId))
      return { ok: false, error: `${donde}: falta initiativeId` };
    ambito = {
      tipo: "iniciativa",
      id: p.initiativeId,
      nombre: p.scopeName,
      proyectoId: p.projectId,
    };
    if (p.taskIds !== undefined) {
      if (!Array.isArray(p.taskIds) || !p.taskIds.every(esId))
        return { ok: false, error: `${donde}: taskIds inválido` };
      tareas = [...p.taskIds];
    }
  }

  const pausadaPor = actor(
    p.pausedByUserId,
    p.pausedByActor,
    `${donde}: pausedBy`,
  );
  if (!pausadaPor.ok) return pausadaPor;
  const pausa: PausaAmbito = {
    id: p.id,
    ambito,
    ...(tareas ? { tareas } : {}),
    motivo: p.motivo,
    revisarEl: p.revisarEl,
    pausadaPor: pausadaPor.valor,
    pausadaEn: p.pausedAt,
  };

  if (p.resumedAt !== null && p.resumedAt !== undefined) {
    if (!esInstante(p.resumedAt))
      return { ok: false, error: `${donde}: resumedAt inválido` };
    const reanudadaPor = actor(
      p.resumedByUserId,
      p.resumedByActor,
      `${donde}: resumedBy`,
    );
    if (!reanudadaPor.ok) return reanudadaPor;
    pausa.reanudadaPor = reanudadaPor.valor;
    pausa.reanudadaEn = p.resumedAt;
    if (p.notaReanudar !== null && p.notaReanudar !== undefined) {
      if (typeof p.notaReanudar !== "string")
        return { ok: false, error: `${donde}: notaReanudar inválida` };
      pausa.notaReanudar = p.notaReanudar;
    }
  } else if (
    (p.resumedByUserId ?? null) !== null ||
    (p.resumedByActor ?? null) !== null
  ) {
    return { ok: false, error: `${donde}: resumedBy sin resumedAt` };
  }
  return { ok: true, valor: pausa };
}

/**
 * Traduce la respuesta de `GET /workspace/{ws}/scope-pauses`. Una sola pausa mal formada invalida la lista entera:
 * el despachador falla cerrado (decisión 17) en vez de ignorar en silencio una pausa que no sabe leer. Aquí una pausa
 * de iniciativa tiene que traer `taskIds` (aunque sea vacío): sin ella, `pausasQueCubren` no cubriría ninguna tarea.
 */
export function traducirPausasVigentesFork(
  entrada: unknown,
): LecturaPausa<PausasVigentes> {
  if (!esObjeto(entrada) || !Array.isArray(entrada.pausas))
    return { ok: false, error: "scope-pauses: falta la lista pausas" };
  if (!esInstante(entrada.calculadoEn))
    return { ok: false, error: "scope-pauses: calculadoEn inválido" };
  const pausas: PausaAmbito[] = [];
  for (const cruda of entrada.pausas) {
    const leida = traducirPausaAmbitoFork(cruda);
    if (!leida.ok) return leida;
    if (
      leida.valor.ambito.tipo === "iniciativa" &&
      leida.valor.tareas === undefined
    ) {
      return {
        ok: false,
        error: `scope-pauses: la pausa ${leida.valor.id} de iniciativa no trae taskIds`,
      };
    }
    pausas.push(leida.valor);
  }
  return { ok: true, valor: { pausas, calculadoEn: entrada.calculadoEn } };
}

const TIPO_CAMBIO: Readonly<
  Record<CambioPausaAmbitoFork["kind"], TipoCambioPausa>
> = {
  created: "creada",
  updated: "cambiada",
  resumed: "reanudada",
};

/** Traduce `GET /scope-pause/{id}/history` (array en orden). */
export function traducirHistorialPausaFork(
  entrada: unknown,
): LecturaPausa<CambioPausaAmbito[]> {
  if (!Array.isArray(entrada))
    return { ok: false, error: "historial: no es un array" };
  const cambios: CambioPausaAmbito[] = [];
  for (const c of entrada) {
    if (!esObjeto(c) || !esId(c.id))
      return { ok: false, error: "historial: cambio sin id" };
    const donde = `historial ${c.id}`;
    if (!esId(c.pauseId))
      return { ok: false, error: `${donde}: falta pauseId` };
    if (typeof c.kind !== "string" || !Object.hasOwn(TIPO_CAMBIO, c.kind))
      return { ok: false, error: `${donde}: kind inválido` };
    if (c.previous !== null && !esObjeto(c.previous))
      return { ok: false, error: `${donde}: previous inválido` };
    if (!esObjeto(c.value))
      return { ok: false, error: `${donde}: value inválido` };
    if (
      c.source !== null &&
      c.source !== undefined &&
      typeof c.source !== "string"
    )
      return { ok: false, error: `${donde}: source inválido` };
    if (!esInstante(c.createdAt))
      return { ok: false, error: `${donde}: createdAt inválido` };
    const hechoPor = actor(c.userId, c.actor, donde);
    if (!hechoPor.ok) return hechoPor;
    cambios.push({
      id: c.id,
      pausaId: c.pauseId,
      tipo: TIPO_CAMBIO[c.kind as CambioPausaAmbitoFork["kind"]],
      anterior: c.previous as Record<string, unknown> | null,
      valor: c.value,
      hechoPor: hechoPor.valor,
      origen: (c.source as string | null | undefined) ?? null,
      en: c.createdAt,
    });
  }
  return { ok: true, valor: cambios };
}

// ── Qué tareas cubre ─────────────────────────────────────────────────────────────────────────────────────────────

export function pausaActiva(pausa: Pick<PausaAmbito, "reanudadaEn">): boolean {
  return pausa.reanudadaEn === undefined;
}

/**
 * Las pausas activas que cubren la tarea (decisión 6): la de su proyecto y la de cualquier iniciativa que la incluye,
 * aunque la iniciativa sea de otro proyecto. Con solapes devuelve todas, en el orden de `pausas`. Una pausa reanudada
 * no cubre nada.
 */
export function pausasQueCubren(
  tarea: { id: string; projectId: string },
  pausas: readonly PausaAmbito[],
): PausaAmbito[] {
  return pausas.filter((pausa) => {
    if (!pausaActiva(pausa)) return false;
    if (pausa.ambito.tipo === "proyecto")
      return pausa.ambito.id === tarea.projectId;
    return pausa.tareas?.includes(tarea.id) ?? false;
  });
}

// ── Rutinas ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Tick consumido sin reabrir porque la tarea está en un ámbito pausado (§4.1). */
export const RESULTADO_RUTINA_SALTADA_PAUSA = "saltada_pausa" as const;
export const RESULTADOS_RUTINA = [
  "reabierta",
  "saltada_abierta",
  RESULTADO_RUTINA_SALTADA_PAUSA,
  "error",
] as const;
export type ResultadoRutina = (typeof RESULTADOS_RUTINA)[number];

/**
 * Lee el `result` (o `lastResult`) de una rutina del fork. El fork puede añadir resultados nuevos: un texto que el
 * lector no conoce no es un error, se lee como `null` (sin resultado conocido) y se ignora. Solo un tipo que no es
 * texto ni `null` es inválido.
 */
export function leerResultadoRutina(
  valor: unknown,
): LecturaPausa<ResultadoRutina | null> {
  if (valor === null || valor === undefined) return { ok: true, valor: null };
  if (typeof valor !== "string")
    return { ok: false, error: "rutina: result no es texto" };
  return {
    ok: true,
    valor: (RESULTADOS_RUTINA as readonly string[]).includes(valor)
      ? (valor as ResultadoRutina)
      : null,
  };
}
