import { z } from "../../openapi";

// Exactly one complete emoji (RGI_Emoji property of strings). Built with the
// constructor because the `v` flag needs an ES2024 target in TypeScript.
export const EMOJI_REGEX = new RegExp("^\\p{RGI_Emoji}$", "v");

export const idParam = z.object({ id: z.string() });

// Body of POST and query of DELETE.
export const reactionInput = z.object({
  // refine, not regex: the OpenAPI generator would publish the RegExp with
  // its flag inside the pattern, which no client can use.
  emoji: z
    .string()
    .refine((value) => EMOJI_REGEX.test(value), "Must be a single emoji")
    .openapi({ description: "A single RGI emoji.", example: "👍" }),
  externalUserName: z.string().trim().min(1).max(120).optional().openapi({
    description:
      "React as a named external actor. Requires workspace:manage_settings.",
  }),
});
