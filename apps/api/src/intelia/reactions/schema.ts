/* eslint-disable no-misleading-character-class */
import { z } from "../../openapi";
export const EMOJI_REGEX =
  /^(?=.*[\p{Extended_Pictographic}\p{Regional_Indicator}])[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f]+$/u;

export const idParam = z.object({ id: z.string() });

// Body of POST and query of DELETE.
export const reactionInput = z.object({
  emoji: z
    .string()
    .min(1)
    .max(32)
    .regex(EMOJI_REGEX, "Must be a valid emoji character"),
  externalUserName: z.string().trim().min(1).max(120).optional().openapi({
    description:
      "React as a named external actor. Requires workspace:manage_settings.",
  }),
});
