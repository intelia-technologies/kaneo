import { nullableResponseTimestamp, responseTimestamp, z } from "../../openapi";
import { SCOPE_PAUSE_CHANGE_KINDS, SCOPE_PAUSE_TYPES } from "../schema";

// The shape the factory's contract reads (PZ-01, `PausaAmbitoFork` in
// software-factory `runtimes/contract/src/pausa-ambito.ts`): fields in
// English except the ones born in Spanish in the table.
export const scopePauseSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    scopeType: z.enum(SCOPE_PAUSE_TYPES),
    projectId: z.string().openapi({
      description:
        "The paused project, or the initiative's home project: the one whose task:update the writes require.",
    }),
    initiativeId: z.string().nullable().openapi({
      description: "The paused initiative; null for a project pause.",
    }),
    scopeName: z.string().openapi({
      description: "The project's or the initiative's name.",
    }),
    taskIds: z.array(z.string()).optional().openapi({
      description:
        "Initiative pauses only (absent for a project): the ids of the initiative's tasks in every project the caller can read, as of this read, so a task added after pausing shows up in the next one.",
    }),
    motivo: z.string(),
    revisarEl: z.string().openapi({ format: "date", example: "2026-11-20" }),
    pausedByUserId: z.string().nullable(),
    pausedByName: z.string().nullable(),
    pausedByActor: z.string().nullable().openapi({
      description: "The graph id the API key's caller declared, if any.",
    }),
    pausedAt: responseTimestamp,
    resumedByUserId: z.string().nullable(),
    resumedByName: z.string().nullable(),
    resumedByActor: z.string().nullable(),
    resumedAt: nullableResponseTimestamp.openapi({
      description: "Null while the pause is active.",
    }),
    notaReanudar: z.string().nullable(),
  })
  .openapi("ScopePause");

export type ScopePause = z.infer<typeof scopePauseSchema>;

export const scopePauseListSchema = z
  .object({
    pausas: z.array(scopePauseSchema),
    calculadoEn: responseTimestamp,
  })
  .openapi("ScopePauseList");

export const pauseAlreadyActiveSchema = z
  .object({
    message: z.string(),
    code: z.literal("PAUSA_YA_ACTIVA"),
    pause: scopePauseSchema,
  })
  .openapi("ScopePauseAlreadyActive");

export const scopePauseChangeSchema = z
  .object({
    id: z.string(),
    pauseId: z.string(),
    kind: z.enum(SCOPE_PAUSE_CHANGE_KINDS),
    previous: z.record(z.string(), z.unknown()).nullable(),
    value: z.record(z.string(), z.unknown()),
    userId: z.string().nullable(),
    userName: z.string().nullable(),
    actor: z.string().nullable(),
    source: z.string().openapi({
      description: "session or api_key: how the change arrived.",
    }),
    createdAt: responseTimestamp,
  })
  .openapi("ScopePauseChange");

export const scopePauseChangeListSchema = z.array(scopePauseChangeSchema);
