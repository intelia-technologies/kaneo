import { z } from "../../openapi";
import { declaredActorInput } from "../task-automation/schema";

export const pauseIdParam = z.object({ pauseId: z.string() });

// Checked in the service, so any missing or bad value answers with the
// pause's own error code (PAUSA_MOTIVO_REQUERIDO, PAUSA_REVISAR_EL_REQUERIDA)
// instead of a generic validation error: a non-string reaches it as "".
function checkedInService(description: string, example: string) {
  return z
    .preprocess(
      (value) =>
        typeof value === "string" ? value : value == null ? undefined : "",
      z.string().optional(),
    )
    .openapi({ type: "string", description, example });
}
const motivo = checkedInService(
  "Why the scope is paused, 3 to 500 characters after trimming. Otherwise 400 PAUSA_MOTIVO_REQUERIDO.",
  "Esperando la decisión de Jaime sobre el alcance",
);
const revisarEl = checkedInService(
  "Date to review the pause (YYYY-MM-DD), after today in Europe/Madrid. Missing or not a date: 400 PAUSA_REVISAR_EL_REQUERIDA; today or earlier: 400 PAUSA_REVISAR_EL_PASADA. The pause never lifts itself.",
  "2026-11-20",
);

export const createPauseInput = z.object({
  motivo,
  revisarEl,
  actor: declaredActorInput,
});

export const updatePauseInput = z
  .object({
    motivo,
    revisarEl,
    actor: declaredActorInput,
  })
  .refine((body) => body.motivo !== undefined || body.revisarEl !== undefined, {
    message: "Nothing to change",
  });

export const resumePauseInput = z.object({
  nota: z.string().trim().max(500).optional().openapi({
    description: "Why it is resumed (optional, up to 500 characters).",
  }),
  actor: declaredActorInput,
});

export const listPausesQuery = z.object({
  estado: z.enum(["activa", "todas"]).default("activa").openapi({
    description:
      "activa (default): only the active pauses. todas: the resumed ones too.",
  }),
  desde: z
    .union([z.iso.date(), z.iso.datetime({ offset: true })])
    .optional()
    .openapi({
      description:
        "With estado=todas, leaves out the pauses resumed before this date (midnight UTC) or instant. Active pauses are always listed; ignored with estado=activa.",
      example: "2026-10-18",
    }),
});
