import { z } from "../../openapi";

// Exactly one complete emoji (RGI_Emoji property of strings). Built with the
// constructor because the `v` flag needs an ES2024 target in TypeScript.
export const EMOJI_REGEX = new RegExp("^\\p{RGI_Emoji}$", "v");

export const idParam = z.object({ id: z.string() });

// Body of POST and query of DELETE.
export const reactionInput = z.object({
  emoji: z.string().regex(EMOJI_REGEX, "Must be a single emoji"),
  externalUserName: z.string().trim().min(1).max(120).optional().openapi({
    description:
      "React as a named external actor. Requires workspace:manage_settings.",
  }),
});
