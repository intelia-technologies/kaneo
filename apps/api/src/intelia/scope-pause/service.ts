import { and, asc, eq, isNull, max } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { userTable } from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import type { InitiativeWriter } from "../initiatives/access";
import {
  type ScopePauseChangeKind,
  scopePauseChangeTable,
  scopePauseTable,
} from "../schema";
import type { Transaction } from "../task-automation/service";
import { isUniqueViolation } from "../unique-violation";
import { type PauseReader, readPause, readPauses } from "./read";
import type { ScopePause } from "./response";
import { revisarElProblem } from "./revisar-el";

export type PauseScope =
  | { type: "project"; projectId: string }
  | { type: "initiative"; initiativeId: string };

type Author = { userId: string; actor: string | null };

function authorOf(writer: InitiativeWriter): Author {
  return {
    userId: writer.userId,
    actor: writer.source === "api_key" ? writer.actor : null,
  };
}

function checkedMotivo(value: string | undefined): string {
  const motivo = value?.trim() ?? "";
  if (motivo.length < 3 || motivo.length > 500) {
    throw new ApiError(400, {
      message: "`motivo` must have 3 to 500 characters",
      code: "PAUSA_MOTIVO_REQUERIDO",
      issues: [{ path: "body.motivo", message: "3 to 500 characters" }],
    });
  }
  return motivo;
}

function checkedRevisarEl(value: string | undefined): string {
  const problem = revisarElProblem(value);
  if (problem === "missing") {
    throw new ApiError(400, {
      message: "`revisarEl` is required, as a date (YYYY-MM-DD)",
      code: "PAUSA_REVISAR_EL_REQUERIDA",
      issues: [{ path: "body.revisarEl", message: "Expected YYYY-MM-DD" }],
    });
  }
  if (problem === "past") {
    throw new ApiError(400, {
      message: "`revisarEl` must be after today (Europe/Madrid)",
      code: "PAUSA_REVISAR_EL_PASADA",
      issues: [{ path: "body.revisarEl", message: "Must be after today" }],
    });
  }
  return value as string;
}

// Strictly increasing per pause, so the log orders by time even with two
// writes in the same millisecond. Safe: writers hold the pause's row lock.
async function nextChangeAt(tx: Transaction, pauseId: string) {
  const [row] = await tx
    .select({ last: max(scopePauseChangeTable.changedAt) })
    .from(scopePauseChangeTable)
    .where(eq(scopePauseChangeTable.pauseId, pauseId));
  const last = row?.last?.getTime() ?? Number.NEGATIVE_INFINITY;
  return new Date(Math.max(Date.now(), last + 1));
}

async function logChange(
  tx: Transaction,
  pauseId: string,
  change: {
    kind: ScopePauseChangeKind;
    previous: Record<string, unknown> | null;
    value: Record<string, unknown>;
  },
  writer: InitiativeWriter,
  at?: Date,
) {
  const author = authorOf(writer);
  await tx.insert(scopePauseChangeTable).values({
    pauseId,
    ...change,
    changedByUserId: author.userId,
    changedByActor: author.actor,
    source: writer.source,
    changedAt: at ?? (await nextChangeAt(tx, pauseId)),
  });
}

function scopeCondition(scope: PauseScope) {
  return scope.type === "project"
    ? eq(scopePauseTable.projectId, scope.projectId)
    : eq(scopePauseTable.initiativeId, scope.initiativeId);
}

export type CreatePauseResult =
  | { created: true; pause: ScopePause }
  | { created: false; pause: ScopePause };

/**
 * Pauses a scope. With an active pause already there (also when two requests
 * race: the partial unique index decides), nothing changes and that pause is
 * returned with `created: false`.
 */
export async function createPause(
  scope: PauseScope,
  input: { motivo?: string; revisarEl?: string },
  writer: InitiativeWriter,
  reader: PauseReader,
): Promise<CreatePauseResult> {
  const motivo = checkedMotivo(input.motivo);
  const revisarEl = checkedRevisarEl(input.revisarEl);
  const author = authorOf(writer);
  // A second try covers an active pause resumed between our failed insert
  // and the read of it.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const id = await db.transaction(async (tx) => {
        const [pause] = await tx
          .insert(scopePauseTable)
          .values({
            workspaceId: reader.workspaceId,
            scopeType: scope.type,
            projectId: scope.type === "project" ? scope.projectId : null,
            initiativeId:
              scope.type === "initiative" ? scope.initiativeId : null,
            motivo,
            revisarEl,
            pausedByUserId: author.userId,
            pausedByActor: author.actor,
          })
          .returning();
        if (!pause) throw new Error("Failed to create the pause");
        await logChange(
          tx,
          pause.id,
          {
            kind: "created",
            previous: null,
            value: {
              scopeType: scope.type,
              scopeId:
                scope.type === "project" ? scope.projectId : scope.initiativeId,
              motivo,
              revisarEl,
            },
          },
          writer,
          pause.pausedAt,
        );
        return pause.id;
      });
      return { created: true, pause: await mustRead(reader, id) };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const [active] = await readPauses(
        reader,
        and(isNull(scopePauseTable.resumedAt), scopeCondition(scope)),
      );
      if (active) return { created: false, pause: active };
    }
  }
  throw new HTTPException(409, {
    message: "The scope's pause changed while pausing it; try again",
  });
}

async function mustRead(reader: PauseReader, pauseId: string) {
  const pause = await readPause(reader, pauseId);
  if (!pause) throw new HTTPException(404, { message: "Pause not found" });
  return pause;
}

async function lockPause(tx: Transaction, pauseId: string) {
  const [pause] = await tx
    .select()
    .from(scopePauseTable)
    .where(eq(scopePauseTable.id, pauseId))
    .for("update")
    .limit(1);
  if (!pause) throw new HTTPException(404, { message: "Pause not found" });
  return pause;
}

/** Changes the reason or the review date of an active pause. */
export async function updatePause(
  pauseId: string,
  input: { motivo?: string; revisarEl?: string },
  writer: InitiativeWriter,
  reader: PauseReader,
) {
  const next: { motivo?: string; revisarEl?: string } = {};
  if (input.motivo !== undefined) next.motivo = checkedMotivo(input.motivo);
  if (input.revisarEl !== undefined) {
    next.revisarEl = checkedRevisarEl(input.revisarEl);
  }
  await db.transaction(async (tx) => {
    const current = await lockPause(tx, pauseId);
    if (current.resumedAt) {
      throw new ApiError(409, {
        message: "The pause was resumed; only an active pause can change",
        code: "PAUSA_REANUDADA",
      });
    }
    const previous: Record<string, unknown> = {};
    const value: Record<string, unknown> = {};
    for (const key of ["motivo", "revisarEl"] as const) {
      const wanted = next[key];
      if (wanted !== undefined && wanted !== current[key]) {
        previous[key] = current[key];
        value[key] = wanted;
      }
    }
    if (Object.keys(value).length === 0) return;
    await tx
      .update(scopePauseTable)
      .set(value)
      .where(eq(scopePauseTable.id, pauseId));
    await logChange(tx, pauseId, { kind: "updated", previous, value }, writer);
  });
  return mustRead(reader, pauseId);
}

/** Lifts a pause. Resuming a resumed pause changes nothing and returns it. */
export async function resumePause(
  pauseId: string,
  input: { nota?: string },
  writer: InitiativeWriter,
  reader: PauseReader,
) {
  const author = authorOf(writer);
  const nota = input.nota?.trim() || null;
  await db.transaction(async (tx) => {
    const current = await lockPause(tx, pauseId);
    if (current.resumedAt) return;
    const at = await nextChangeAt(tx, pauseId);
    await tx
      .update(scopePauseTable)
      .set({
        resumedAt: at,
        resumedByUserId: author.userId,
        resumedByActor: author.actor,
        notaReanudar: nota,
      })
      .where(eq(scopePauseTable.id, pauseId));
    await logChange(
      tx,
      pauseId,
      {
        kind: "resumed",
        previous: { resumedAt: null },
        value: { resumedAt: at.toISOString(), notaReanudar: nota },
      },
      writer,
      at,
    );
  });
  return mustRead(reader, pauseId);
}

const changedBy = alias(userTable, "scope_pause_changed_by");

/** The pause's change log, oldest first. */
export function listPauseChanges(pauseId: string) {
  return db
    .select({
      id: scopePauseChangeTable.id,
      pauseId: scopePauseChangeTable.pauseId,
      kind: scopePauseChangeTable.kind,
      previous: scopePauseChangeTable.previous,
      value: scopePauseChangeTable.value,
      userId: scopePauseChangeTable.changedByUserId,
      userName: changedBy.name,
      actor: scopePauseChangeTable.changedByActor,
      source: scopePauseChangeTable.source,
      createdAt: scopePauseChangeTable.changedAt,
    })
    .from(scopePauseChangeTable)
    .leftJoin(
      changedBy,
      eq(scopePauseChangeTable.changedByUserId, changedBy.id),
    )
    .where(eq(scopePauseChangeTable.pauseId, pauseId))
    .orderBy(
      asc(scopePauseChangeTable.changedAt),
      asc(scopePauseChangeTable.id),
    );
}
