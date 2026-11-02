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

// Who an API key's caller acts for, logged as given: the gateway has already
// checked it in the graph; Kaneo does not. An invalid one is dropped, never an
// error, so it cannot block a write the gateway allowed.
const DECLARED_ACTOR = /^(agent|person):[a-z0-9-]+$/;

// Shared by every write that takes a declared actor (initiatives too).
export const declaredActorInput = z
  .preprocess(
    (value) =>
      typeof value === "string" &&
      value.length <= 100 &&
      DECLARED_ACTOR.test(value)
        ? value
        : undefined,
    z.string().max(100).regex(DECLARED_ACTOR).optional(),
  )
  .openapi({
    type: "string",
    maxLength: 100,
    pattern: DECLARED_ACTOR.source,
    description:
      "With an API key only: the graph id the caller acts for (agent:…, person:…), informative and not checked by Kaneo. An invalid one is ignored. A session acts as its own user and must not send it.",
    example: "agent:orq-jaime",
  });

export const putAutomationInput = z.intersection(
  automationInput,
  z.object({ actor: declaredActorInput }),
);

export const automationHistoryQuery = z.object({
  limit: pagingNumber(1, 200, 50).openapi({
    description: "Maximum number of changes, newest first.",
  }),
});
