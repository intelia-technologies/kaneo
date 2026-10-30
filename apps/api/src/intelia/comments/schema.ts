import { pagingNumber, z } from "../../openapi";

export const workspaceIdParam = z.object({
  workspaceId: z.string().openapi({
    description: "Workspace ID",
    example: "ws_xxxxxxxxxxxxxxxxxxxxxxxxx",
  }),
});

export const workspaceCommentsQuery = z.object({
  since: z
    .string()
    .datetime({ offset: true })
    .transform((val) => new Date(val))
    .openapi({
      type: "string",
      format: "date-time",
      description:
        "ISO 8601 timestamp. Returns comments created at or after this time (or strictly after when afterId is also supplied).",
      example: "2026-10-30T10:00:00.000Z",
    }),
  afterId: z
    .string()
    .trim()
    .transform((val) => (val.length > 0 ? val : undefined))
    .optional()
    .openapi({
      description:
        "Comment ID cursor for stable pagination when multiple comments share the same createdAt timestamp.",
      example: "act_xxxxxxxxxxxxxxxxxxxxxxxxx",
    }),
  limit: pagingNumber(1, 200, 100).openapi({
    description: "Maximum number of comments to return (default 100, max 200).",
  }),
});
