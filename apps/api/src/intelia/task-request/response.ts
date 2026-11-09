import { nullableResponseTimestamp, responseTimestamp, z } from "../../openapi";

const requesterSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
});

export const taskRequesterSchema = z
  .object({
    taskId: z.string(),
    requester: requesterSchema,
    requestedAt: responseTimestamp,
    closedAt: nullableResponseTimestamp.openapi({
      description:
        "When the task reached a cancelled column; from then on the requester has no access.",
    }),
    closedReason: z.string().nullable(),
  })
  .openapi("TaskRequester");

export const requestSummarySchema = z
  .object({
    taskId: z.string(),
    title: z.string(),
    ticketId: z.string().nullable().openapi({ example: "SF-745" }),
    status: z.string(),
    statusName: z.string().nullable().openapi({
      description: "The name of the task's column, if it has one.",
    }),
    projectId: z.string(),
    projectName: z.string(),
    requestedAt: responseTimestamp,
  })
  .openapi("RequestSummary");

export const requestCommentSchema = z
  .object({
    id: z.string(),
    userId: z.string().nullable(),
    userName: z.string().nullable(),
    externalUserName: z.string().nullable(),
    content: z.string(),
    createdAt: responseTimestamp,
  })
  .openapi("RequestComment");

export const requestDetailSchema = requestSummarySchema
  .extend({
    description: z.string().nullable(),
    requester: requesterSchema,
    comments: z.array(requestCommentSchema),
  })
  .openapi("RequestDetail");

export const myRequestSchema = requestSummarySchema
  .extend({
    state: z.enum(["open", "rejected", "cancelled"]).openapi({
      description:
        "`open` until the task reaches a cancelled column; then `rejected` if a rejection gave a reason, `cancelled` otherwise.",
    }),
    closedAt: nullableResponseTimestamp,
    closedReason: z.string().nullable().openapi({
      description: "The rejection's reason; null for an ordinary cancellation.",
    }),
    followable: z.boolean().openapi({
      description:
        "Whether the requester can still open and comment on the task (`GET /request/{taskId}`); false once closed.",
    }),
  })
  .openapi("MyRequest");

export const requestListSchema = z
  .object({ requests: z.array(myRequestSchema) })
  .openapi("RequestList");
