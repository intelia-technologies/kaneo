import { nullableResponseTimestamp, z } from "../../openapi";

export const projectIdParam = z.object({ projectId: z.string() });

// Bounds of a write: SF has ~600 open tasks; ids and slugs are short.
const MAX_TASKS = 5000;
const MAX_COLUMNS = 50;
const MAX_TEXT = 280;

const isoDate = z.iso.datetime({ offset: true });

const columnSignal = z
  .object({
    media_s: z.number().int().nonnegative().openapi({
      description:
        "Mean time, in seconds, that tasks stay in the column: the project's over the last 30 days, or the organization's if the project has fewer than 20 tasks there.",
    }),
    tareas: z.number().int().nonnegative().openapi({
      description: "Tasks behind the mean.",
    }),
    ambito: z.enum(["proyecto", "organizacion"]).openapi({
      description: "Whether the mean is the project's or the organization's.",
    }),
  })
  .openapi("BoardSignalColumn");

const taskSignal = z
  .object({
    alarma: z
      .object({
        cuando: isoDate,
        motivo: z.string().max(MAX_TEXT).nullable(),
      })
      .nullable()
      .openapi({ description: "The task's next alarm, if any." }),
    espera_a: z.string().max(MAX_TEXT).nullable().openapi({
      description:
        "Who or what a blocked task waits for (a person, a task, a real test or a date).",
    }),
    worker: z
      .object({
        estado: z.enum(["activo", "caido", "terminado"]).openapi({
          description:
            "activo: alive (heartbeat or activity in the last 30 min). caido: no sign of life in 30 min without having finished, or failed. terminado: asleep or retired.",
        }),
        instancia: z.string().min(1).max(MAX_TEXT),
        rol: z.string().max(MAX_TEXT),
        ultima_senal: isoDate.nullable(),
        trabajando: z.boolean(),
      })
      .nullable()
      .openapi({ description: "The task's worker, if it has had one." }),
  })
  .openapi("BoardSignalTask");

const signalsShape = {
  columnas: z
    .record(z.string().max(MAX_TEXT), columnSignal)
    .refine((r) => Object.keys(r).length <= MAX_COLUMNS, {
      message: `At most ${MAX_COLUMNS} columns`,
    })
    .openapi({ description: "By column slug, the columns with a mean." }),
  tareas: z
    .record(z.string().max(MAX_TEXT), taskSignal)
    .refine((r) => Object.keys(r).length <= MAX_TASKS, {
      message: `At most ${MAX_TASKS} tasks`,
    })
    .openapi({
      description:
        "By task id, the open tasks with an alarm, a wait or a worker.",
    }),
};

export const putBoardSignalsInput = z
  .object({
    calculado_en: isoDate.openapi({
      description: "When the factory computed these signals.",
    }),
    ...signalsShape,
  })
  .openapi("PutBoardSignals");

export const boardSignalsSchema = z
  .object({
    calculado_en: nullableResponseTimestamp.openapi({
      description:
        "When the factory computed the stored signals; null if it never sent any for this project.",
    }),
    ...signalsShape,
  })
  .openapi("BoardSignals");

export type BoardSignalsInput = z.infer<typeof putBoardSignalsInput>;
export type BoardSignalsData = Pick<BoardSignalsInput, "columnas" | "tareas">;
