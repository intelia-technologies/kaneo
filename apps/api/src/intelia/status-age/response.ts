import { responseTimestamp, z } from "../../openapi";

const columnStatsSchema = z
  .object({
    p75_s: z.number().int().nullable().openapi({
      description:
        "75th percentile, in seconds, of the finished stays in the column. Null with fewer than 10 cases.",
    }),
    p90_s: z.number().int().nullable().openapi({
      description:
        "90th percentile, in seconds, of the finished stays in the column. Null with fewer than 10 cases.",
    }),
    casos: z.number().int().openapi({
      description:
        "Finished stays in the column that exited in the last 90 days.",
    }),
  })
  .openapi("StatusAgeColumn");

export const projectStatusAgeSchema = z
  .object({
    tareas: z.record(z.string(), responseTimestamp).openapi({
      description:
        "Every task of the project outside Done and Cancelled, by id, with when it entered its current column: its last status change or, if it never changed, its creation.",
    }),
    columnas: z.record(z.string(), columnStatsSchema).openapi({
      description:
        "By column slug, every column with a finished stay that exited in the last 90 days.",
    }),
    calculado_en: responseTimestamp.openapi({
      description:
        "When `columnas` was computed; it is kept up to 10 minutes per project.",
    }),
  })
  .openapi("ProjectStatusAge");
