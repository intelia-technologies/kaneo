import { responseTimestamp, z } from "../../openapi";

export const workspaceCommentSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    taskTitle: z.string(),
    taskStatus: z.string(),
    projectId: z.string(),
    userId: z.string().nullable(),
    userName: z.string().nullable(),
    externalUserName: z.string().nullable(),
    content: z.string(),
    createdAt: responseTimestamp,
  })
  .openapi("WorkspaceComment");

export const workspaceCommentsResponseSchema = z
  .object({
    comments: z.array(workspaceCommentSchema),
    hasMore: z.boolean(),
  })
  .openapi("WorkspaceCommentsResponse");
