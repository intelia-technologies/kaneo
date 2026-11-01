import { pagingNumber, z } from "../../openapi";
import { AUTOMATION_LEVELS } from "../schema";

export const taskIdParam = z.object({ taskId: z.string() });

export const projectIdParam = z.object({ projectId: z.string() });

export const automationLevel = z.enum(AUTOMATION_LEVELS).openapi({
  description:
    "manual: the orchestrator starts, merges and closes. arranque: the flow engine starts it once ready; the orchestrator merges. completa: the engine starts it and, with verification passed, merges and closes.",
});

export const COMPLETA_NEEDS_VERIFICATION =
  "`completa` requires verification: true";

// The level and the verification switch, always together (design 18 §3).
export const automationInput = z
  .object({
    level: automationLevel,
    verification: z.boolean().openapi({
      description: "Whether the verifier checks the task when the worker ends.",
    }),
  })
  .refine((value) => value.level !== "completa" || value.verification, {
    message: COMPLETA_NEEDS_VERIFICATION,
    path: ["verification"],
  });

export const putAutomationInput = z
  .object({
    level: automationLevel,
    verification: z.boolean().openapi({
      description: "Whether the verifier checks the task when the worker ends.",
    }),
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
  })
  .refine((value) => value.level !== "completa" || value.verification, {
    message: COMPLETA_NEEDS_VERIFICATION,
    path: ["verification"],
  });

export const automationHistoryQuery = z.object({
  limit: pagingNumber(1, 200, 50).openapi({
    description: "Maximum number of changes, newest first.",
  }),
});
