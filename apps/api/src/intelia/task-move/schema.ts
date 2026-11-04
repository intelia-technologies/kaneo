import { z } from "../../openapi";
import { declaredActorInput } from "../task-automation/schema";

export const taskIdParam = z.object({ taskId: z.string() });

export const moveTaskInput = z.object({
  projectId: z.string().min(1).openapi({
    description: "The destination project, in the same workspace.",
  }),
  dryRun: z.boolean().default(false).openapi({
    description:
      "Do the whole move and roll it back: the response says what a move would do (new number, column, fields, labels, initiative) and nothing is written.",
  }),
  discardFields: z.array(z.string().min(1)).max(100).default([]).openapi({
    description:
      "Custom fields (by name) that may be dropped when the destination lacks them or their option. Without it, such a field makes the move fail.",
  }),
  actor: declaredActorInput,
});
