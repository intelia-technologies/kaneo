import { pagingNumber, z } from "../../openapi";
import { AUTOMATION_LEVELS } from "../schema";

export const taskIdParam = z.object({ taskId: z.string() });

export const projectIdParam = z.object({ projectId: z.string() });

const LEVEL_DESCRIPTION =
  "manual: the orchestrator starts, merges and closes. arranque: the flow engine starts it once ready; the orchestrator merges. completa: the engine starts it and, with verification passed, merges and closes.";
const VERIFICATION_DESCRIPTION =
  "Whether the verifier checks the task when the worker ends.";

export const COMPLETA_NEEDS_VERIFICATION =
  "`completa` requires verification: true";

// The level and the verification switch, always together (design 18 §3).
// A union by level, so the published contract and the inferred input type
// both say what the API accepts: `completa` only with verification.
const automationVariants = [
  z.object({
    level: z.literal("completa").openapi({ description: LEVEL_DESCRIPTION }),
    verification: z
      .literal(true, { error: COMPLETA_NEEDS_VERIFICATION })
      .openapi({ description: VERIFICATION_DESCRIPTION }),
  }),
  z.object({
    level: z
      .enum(AUTOMATION_LEVELS)
      .exclude(["completa"])
      .openapi({ description: LEVEL_DESCRIPTION }),
    verification: z
      .boolean()
      .openapi({ description: VERIFICATION_DESCRIPTION }),
  }),
] as const;

export const automationInput = z
  .discriminatedUnion("level", automationVariants)
  .openapi({
    description:
      "The task's automation level and verification (Intelia fork). Required when creating a task, with no default. `completa` requires verification.",
  });

export const putAutomationInput = z.intersection(
  automationInput,
  z.object({
    actor: z
      .string()
      .trim()
      .regex(/^[a-z]+:[A-Za-z0-9._@-]{1,200}$/, "Expected a graph id")
      .optional()
      .openapi({
        description:
          "Only with the gateway's service token, and then required: the graph id the gateway acts for (agent:…, person:…). A session always acts as its own user.",
        example: "agent:orq-jaime",
      }),
  }),
);

export const automationHistoryQuery = z.object({
  limit: pagingNumber(1, 200, 50).openapi({
    description: "Maximum number of changes, newest first.",
  }),
});
