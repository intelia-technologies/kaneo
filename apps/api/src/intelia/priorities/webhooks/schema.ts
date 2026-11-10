import { responseTimestamp, z } from "../../../openapi";

export const priorityWebhookIdParam = z.object({
  priorityWebhookId: z.string(),
});

export const createPriorityWebhookInput = z.object({
  url: z
    .url({ protocol: /^https?$/ })
    .max(2000)
    .openapi({
      description:
        "Where to POST each `intelia.priority_changed` event; http or https, never a private address.",
    }),
  secret: z.string().min(1).max(500).optional().openapi({
    description:
      "Signs each body: X-Kaneo-Signature is its HMAC-SHA256 in hex. Never returned.",
  }),
});

export const priorityWebhookSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    url: z.string(),
    hasSecret: z.boolean(),
    createdByUserId: z.string().nullable(),
    createdAt: responseTimestamp,
  })
  .openapi("PriorityWebhook");

export const priorityWebhookListSchema = z
  .object({ webhooks: z.array(priorityWebhookSchema) })
  .openapi("PriorityWebhookList");

export type CreatePriorityWebhookInput = z.infer<
  typeof createPriorityWebhookInput
>;
