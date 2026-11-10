import { z } from "../../openapi";

export const renameProjectBody = z.object({
  name: z.string().trim().min(1).max(100).openapi({
    description: "The new name, trimmed: not empty and at most 100 characters.",
    example: "Software Factory",
  }),
});
