import { z } from "../../openapi";

// The fields of `estado_compartido` as the factory contract fixes them
// (software-factory runtimes/contract/src/cadena.ts, `validarEstadoCompartido`;
// annex of design 33 §4.1). Kaneo stores and returns the declaration; the
// compose in `servicios` is checked against the allowlist by the dispatcher
// and the host's antenna, which own the catalog.
const NOMBRE_CADENA_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SERVICIOS_MAX = 65_536;

export const estadoCompartidoSchema = z
  .strictObject({
    nombre: z.string().regex(NOMBRE_CADENA_RE).openapi({
      description:
        "The chain's name, unique in the organization: lowercase letters, digits and hyphens, up to 40, starting with a letter or digit.",
    }),
    datos: z.literal("intelia").nullable().openapi({
      description:
        "intelia when the chain holds client data (host and workers only on accredited machines); null otherwise.",
    }),
    ficheros: z.boolean().openapi({
      description: "Whether the chain shares a file volume, at /cadena.",
    }),
    tamano_max_gb: z.number().int().min(1).max(2000).openapi({
      description: "Maximum size of the chain's state, in GB (1 to 2000).",
    }),
    servicios: z
      .string()
      .max(SERVICIOS_MAX)
      .refine((value) => value.trim() !== "", {
        message: "A compose file or null",
      })
      .nullable()
      .openapi({
        description:
          "A docker compose file with the chain's services (our extensions in x-sf-*), stored as given; null without services.",
      }),
  })
  .refine((value) => value.ficheros || value.servicios !== null, {
    message: "Without files or services there is nothing to share",
    path: ["servicios"],
  })
  .openapi("EstadoCompartido", {
    description:
      "The state the tasks of a chain share (annex of design 33 §4.1): a file volume and services in docker compose. No seed field.",
  });

export type EstadoCompartido = z.infer<typeof estadoCompartidoSchema>;

/**
 * The value with its keys in a fixed order. PostgreSQL's jsonb reorders keys,
 * so change detection compares canonical copies, not the raw stored object.
 */
export function canonicalEstadoCompartido(
  value: EstadoCompartido | null,
): EstadoCompartido | null {
  if (value === null) return null;
  return {
    nombre: value.nombre,
    datos: value.datos,
    ficheros: value.ficheros,
    tamano_max_gb: value.tamano_max_gb,
    servicios: value.servicios,
  };
}
