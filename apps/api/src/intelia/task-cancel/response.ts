import { apiErrorSchema } from "../../errors/api-error-schema";
import { z } from "../../openapi";

const movida = z.object({
  tarea: z.string(),
  de: z
    .array(z.string())
    .openapi({ description: "Cancelled tasks it depended on." }),
  a: z.string(),
});

export const cancelResultSchema = z
  .object({
    canceladas: z
      .array(z.string())
      .openapi({ description: "Every task cancelled, the root first." }),
    quitadas: z.array(z.string()),
    movidas: z.array(movida),
    otros_tableros: z.array(
      z.union([
        z.object({ tarea: z.string(), responsable: z.string().nullable() }),
        z.object({ oculta: z.literal(true), tablero: z.string() }),
      ]),
    ),
    comentarios: z.number().int().openapi({ description: "Comments written." }),
  })
  .openapi("CancelTaskResult");

const nodo = z
  .object({
    tipo: z.enum(["decidir", "otro_tablero", "oculta"]),
    ticket: z.string().optional(),
    titulo: z.string().optional(),
    tablero: z.string(),
    estado: z.string().optional(),
    nivel: z.number().int(),
    depende_de: z
      .array(z.object({ ticket: z.string(), relacion: z.string() }))
      .optional(),
    solo_si_cancelas: z.array(z.string()),
    responsable: z.string().nullable().optional(),
    opciones: z.array(z.enum(["cancelar", "quitar", "mover"])).optional(),
    cuelgan: z.number().int().optional(),
    asignado: z.string().nullable().optional(),
    automatica: z.boolean().optional(),
    rutina_activa: z.boolean().optional(),
    en_curso: z.boolean().optional(),
    automatico: z.string().optional(),
  })
  .openapi({
    description:
      "A task of the chain. `oculta` (a project the caller does not read) has only `tipo`, `tablero`, `nivel` and `solo_si_cancelas`.",
  });

export const dependenciesErrorSchema = z
  .object({
    error: z.literal("DEPENDENCIAS_SIN_RESOLVER"),
    message: z.string(),
    details: z.object({
      tarea: z.object({
        ticket: z.string(),
        titulo: z.string(),
        tablero: z.string(),
      }),
      motivo: z.object({ requerido: z.boolean(), recibido: z.boolean() }),
      total: z.number().int(),
      truncada: z.boolean(),
      cadena: z.array(nodo),
      pendientes: z.array(z.string()),
      problemas: z.array(
        z.object({
          tarea: z.string(),
          problema: z.string(),
          detalle: z.string(),
        }),
      ),
      opciones: z.object({
        cancelar: z.string(),
        quitar: z.string(),
        mover: z.string(),
      }),
      otros_tableros: z.string(),
      ejemplo_resoluciones: z.array(
        z.object({
          tarea: z.string(),
          accion: z.string(),
          a: z.string().optional(),
        }),
      ),
      a_mano: z.string(),
    }),
  })
  .openapi("DependenciesUnresolvedError");

/**
 * The 409 of a path that cancels or deletes a task: its own conflicts, or the
 * guard's `DEPENDENCIAS_SIN_RESOLVER` (design 82, decision 17).
 */
export const conflictOrDependenciesSchema = z.union([
  apiErrorSchema,
  dependenciesErrorSchema,
]);
