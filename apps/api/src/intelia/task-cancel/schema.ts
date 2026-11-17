import { z } from "../../openapi";

export const taskIdParam = z.object({ taskId: z.string() });

const ticket = z.string().regex(/^[A-Z][A-Z0-9]*-\d+$/);

/** What happens to each dependent of the chain (§4.3); also for `/reject`. */
export const resolucionesInput = z
  .array(
    z.object({
      tarea: ticket.openapi({
        description: "Key of the dependent (`SF-2493`).",
      }),
      // Checked against the chain: an unchosen «elige: …» comes back as
      // `accion_desconocida` in the 409, not as a 400.
      accion: z
        .string()
        .openapi({ description: "`cancelar`, `quitar` or `mover`." }),
      a: ticket.optional().openapi({
        description:
          "Only with `mover`: key of the task the dependency moves to.",
      }),
    }),
  )
  .max(1000);

export const cancelTaskInput = z
  .object({
    motivo: z.string().min(10).max(1000).regex(/\S/).optional().openapi({
      description:
        "Why it is cancelled. Required (10 to 1000 characters) when the task has open dependents; without them it only becomes a comment.",
    }),
    resoluciones: resolucionesInput.optional().openapi({
      description:
        "One per dependent of the chain in play: they must cover it exactly (decision 12), or nothing is applied.",
    }),
    actor: z
      .string()
      .regex(/^[a-z]+:[A-Za-z0-9._-]{1,120}$/)
      .optional()
      .openapi({
        description:
          "Graph id the caller acts for (`agent:forja`), for the comments and the event. Informative; only with an API key.",
      }),
    firma: z.string().trim().min(1).max(200).optional().openapi({
      description:
        "Name the comments are signed with (`externalUserName`), as the gateway signs its comments. Needs workspace:manage_settings, like importing an external author in `POST /comment`.",
    }),
    lote: z.array(z.string().min(1)).min(1).max(1000).optional().openapi({
      description:
        "Ids or keys of the batch this cancellation belongs to (decision 18): its dependents in the batch count as `cancelar`.",
    }),
  })
  .strict();
