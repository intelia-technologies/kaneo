import { responseTimestamp, z } from "../../openapi";

export const reactionSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    commentId: z.string().nullable(),
    emoji: z.string(),
    userId: z.string(),
    userName: z.string().nullable(),
    externalUserName: z.string().nullable(),
    createdAt: responseTimestamp,
  })
  .openapi("Reaction");

export const reactionListSchema = z.array(reactionSchema);
