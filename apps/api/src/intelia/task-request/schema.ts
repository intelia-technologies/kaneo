import { z } from "../../openapi";
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
});

export const requestCommentInput = z.object({
  content: z.string().trim().min(1).max(10_000),
});
