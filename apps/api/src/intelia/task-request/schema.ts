import { z } from "../../openapi";
import { resolucionesInput } from "../task-cancel/schema";
import { declaredActorInput } from "../task-automation/schema";

export const taskIdParam = z.object({ taskId: z.string() });
export const workspaceIdParam = z.object({ workspaceId: z.string() });

export const setRequesterInput = z.object({
  userId: z.string().min(1).openapi({
    description:
      "The requester: a member of the task's workspace. Needs no access to the task's project.",
  }),
  actor: declaredActorInput,
});

export const rejectRequestInput = z.object({
  reason: z.string().trim().min(1).max(2000).openapi({
    description: "Why the request is rejected; the requester gets it.",
  }),
  resoluciones: resolucionesInput.optional().openapi({
    description:
      "What happens to each open dependent of the task, as in `POST /intelia/task/{taskId}/cancel` (design 82 §4.3), with `reason` as its `motivo`: they must cover its chain exactly, or nothing changes.",
  }),
});

export const requestCommentInput = z.object({
  content: z.string().trim().min(1).max(10_000),
});
