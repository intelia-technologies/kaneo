import { pagingNumber, z } from "../../openapi";
import { estadoCompartidoSchema } from "../estado-compartido/schema";
import { declaredActorInput } from "../task-automation/schema";

export const projectIdParam = z.object({ projectId: z.string() });
export const initiativeIdParam = z.object({ initiativeId: z.string() });
export const taskIdParam = z.object({ taskId: z.string() });
export const workspaceIdParam = z.object({ workspaceId: z.string() });

// At most this many tasks per batch read of initiatives.
export const TASK_INITIATIVES_MAX_TASKS = 500;

export const taskInitiativesInput = z.object({
  taskIds: z
    .array(z.string().min(1))
    .min(1)
    .max(TASK_INITIATIVES_MAX_TASKS)
    .openapi({
      description: `Ids of the tasks, 1 to ${TASK_INITIATIVES_MAX_TASKS}. Repeated ids count once.`,
    }),
});

const name = z.string().trim().min(1).max(200).openapi({
  description:
    "Unique within the project, ignoring case, accents and repeated spaces.",
});
const designUrl = z
  .url()
  .max(2000)
  .nullable()
  .openapi({ description: "Link to the design document." });
const approvedBy = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .nullable()
  .openapi({ description: "Who approved the plan." });
const approvedAt = z.iso
  .datetime({ offset: true })
  .nullable()
  .openapi({ description: "When the plan was approved." });
const objetivo = z.string().trim().min(1).nullable().openapi({
  description: "ID of a task belonging to this initiative, or null.",
});
const hitos_externos = z
  .array(
    z.object({
      nombre: z.string().trim().min(1),
      enlace: z.string().trim().min(1),
      estado: z.enum(["pendiente", "hecho", "bloqueado"]),
      tarea: z.string().trim().min(1).optional(),
    }),
  )
  .nullable();
const estado_compartido = estadoCompartidoSchema.nullable().openapi({
  description:
    "The state the initiative's tasks share (annex of design 33 §4.1), or null. In PATCH, omit to keep it and null to clear it.",
});

export const createInitiativeInput = z.object({
  name,
  objetivo: z.null().optional(),
  hitos_externos: hitos_externos.optional(),
  estado_compartido: estado_compartido.optional(),
  designUrl: designUrl.optional(),
  approvedBy: approvedBy.optional(),
  approvedAt: approvedAt.optional(),
  actor: declaredActorInput,
});

export const updateInitiativeInput = z
  .object({
    name: name.optional(),
    objetivo: objetivo.optional(),
    hitos_externos: hitos_externos.optional(),
    estado_compartido: estado_compartido.optional(),
    designUrl: designUrl.optional(),
    approvedBy: approvedBy.optional(),
    approvedAt: approvedAt.optional(),
    actor: declaredActorInput,
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.objetivo !== undefined ||
      body.hitos_externos !== undefined ||
      body.estado_compartido !== undefined ||
      body.designUrl !== undefined ||
      body.approvedBy !== undefined ||
      body.approvedAt !== undefined,
    { message: "Nothing to change" },
  );

export const closePlanInput = z.object({ actor: declaredActorInput });

export const putTaskInitiativeInput = z.object({
  initiativeId: z.string().min(1),
  actor: declaredActorInput,
});

export const historyQuery = z.object({
  limit: pagingNumber(1, 200, 50).openapi({
    description: "Maximum number of changes, newest first.",
  }),
});

// The initiative of a task being created (design 19 §3): an existing one of
// the project, or the one of the parent for a subtask.
export const initiativeOnCreateInput = z
  .union([
    z.strictObject({
      id: z.string().min(1).openapi({
        description: "An initiative of the task's project.",
      }),
    }),
    z.strictObject({
      parentTaskId: z.string().min(1).openapi({
        description:
          "The parent of a subtask: the new task takes the parent's initiative, which must belong to the same project.",
      }),
    }),
  ])
  .openapi({
    description:
      "The task's initiative (Intelia fork). Required, with no default: `{ id }` or, for a subtask, `{ parentTaskId }`.",
  });

export type InitiativeOnCreate = z.infer<typeof initiativeOnCreateInput>;
