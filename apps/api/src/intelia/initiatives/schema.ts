import { pagingNumber, z } from "../../openapi";
import { declaredActorInput } from "../task-automation/schema";

export const projectIdParam = z.object({ projectId: z.string() });
export const initiativeIdParam = z.object({ initiativeId: z.string() });
export const taskIdParam = z.object({ taskId: z.string() });

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

export const createInitiativeInput = z.object({
  name,
  designUrl: designUrl.optional(),
  approvedBy: approvedBy.optional(),
  approvedAt: approvedAt.optional(),
  actor: declaredActorInput,
});

export const updateInitiativeInput = z
  .object({
    name: name.optional(),
    designUrl: designUrl.optional(),
    approvedBy: approvedBy.optional(),
    approvedAt: approvedAt.optional(),
    actor: declaredActorInput,
  })
  .refine(
    (body) =>
      body.name !== undefined ||
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
