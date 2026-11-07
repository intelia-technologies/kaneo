import { pagingNumber, z } from "../../openapi";
import { AUTOMATION_LEVELS, DELIVERY_KINDS } from "../schema";

export const taskIdParam = z.object({ taskId: z.string() });

export const projectIdParam = z.object({ projectId: z.string() });

const LEVEL_DESCRIPTION =
  "Former level, read by the old flow engine until the cut (design 48 §3.12); `automatica` replaces it. manual: the orchestrator starts, merges and closes. arranque: the flow engine starts it once ready; the orchestrator merges. completa: the engine starts it and, with verification passed, merges and closes. Tied to `automatica`: manual is no, arranque and completa are yes.";
const VERIFICATION_DESCRIPTION =
  "Whether the verifier checks the task when the worker ends.";
const AUTOMATICA_DESCRIPTION =
  "Design 48 §3.2. Yes: the dispatcher moves the columns. No: the responsible does. Without `level`, no stores `manual` and yes keeps `arranque` or `completa`, else `arranque`.";

export const COMPLETA_NEEDS_VERIFICATION =
  "`completa` requires verification: true";
export const LEVEL_CONTRADICTS_AUTOMATICA =
  "`level` contradicts `automatica`: manual is no, arranque and completa are yes";
export const PAUSE_NEEDS_MANUAL =
  "`pausaMotivo` is only for `automatica: false`";

// One line, as the dispatcher writes it in comments and anomalies.
const ONE_LINE = /^[^\r\n]*$/;
// A graph id (agent:…, person:…): the roles and a declared actor.
const DECLARED_ACTOR = /^(agent|person):[a-z0-9-]+$/;
const COLUMN_SLUG = /^[a-z0-9-]+$/;

const graphId = (description: string) =>
  z
    .string()
    .max(100)
    .regex(DECLARED_ACTOR)
    .nullable()
    .openapi({ description, example: "agent:forja" });

// The fields of design 48 §3.2 besides `automatica` and `verification`; each
// optional. Null clears one.
const fieldInputs = {
  pausaMotivo: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .regex(ONE_LINE, "One line")
    .nullable()
    .optional()
    .openapi({
      description:
        "Why it is paused; only with `automatica: false`. Omitted, it stays while `automatica` stays off and clears when `automatica` changes.",
      example: "movida_a_mano",
    }),
  entrega: z
    .enum(DELIVERY_KINDS)
    .nullable()
    .optional()
    .openapi({ description: "What the task delivers: a PR or none." }),
  responsable: graphId(
    "The project's orchestrator or the person who owns it.",
  ).optional(),
  implementador: graphId("The instance that implements it.").optional(),
  verificador: graphId("The instance that verifies it.").optional(),
  columnaPrevia: z
    .string()
    .max(50)
    .regex(COLUMN_SLUG)
    .nullable()
    .optional()
    .openapi({
      description: "Column slug a task in Queued or Blocked came from.",
      example: "in-progress",
    }),
};

type AutomationFieldsInput = {
  level?: (typeof AUTOMATION_LEVELS)[number];
  automatica?: boolean;
  verification?: boolean;
  pausaMotivo?: string | null;
};

// What a single request can contradict on its own; against the stored value,
// the service checks the rest (`resolveAutomation`).
function checkFields(value: AutomationFieldsInput, ctx: z.RefinementCtx) {
  if (value.level === "completa" && value.verification === false) {
    ctx.addIssue({
      code: "custom",
      path: ["verification"],
      message: COMPLETA_NEEDS_VERIFICATION,
    });
  }
  if (
    value.level !== undefined &&
    value.automatica !== undefined &&
    (value.level !== "manual") !== value.automatica
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["automatica"],
      message: LEVEL_CONTRADICTS_AUTOMATICA,
    });
  }
  if (value.automatica === true && value.pausaMotivo != null) {
    ctx.addIssue({
      code: "custom",
      path: ["pausaMotivo"],
      message: PAUSE_NEEDS_MANUAL,
    });
  }
}

// At creation (design 18 §3, design 48 §3.2): the verification and either
// `automatica` or the former level, with no default; the other fields are
// optional.
export const automationInput = z
  .object({
    level: z
      .enum(AUTOMATION_LEVELS)
      .optional()
      .openapi({ description: LEVEL_DESCRIPTION }),
    automatica: z
      .boolean()
      .optional()
      .openapi({ description: AUTOMATICA_DESCRIPTION }),
    verification: z
      .boolean()
      .openapi({ description: VERIFICATION_DESCRIPTION }),
    ...fieldInputs,
  })
  .superRefine((value, ctx) => {
    if (value.level === undefined && value.automatica === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["automatica"],
        message: "`automatica` or `level` is required",
      });
    }
    checkFields(value, ctx);
  })
  .openapi({
    description:
      "The task's automation (Intelia fork, design 48 §3.2). Required when creating a task, with no default: the verification and `automatica` (or the former `level`). `completa` requires verification.",
  });

// Who an API key's caller acts for, logged as given: the gateway has already
// checked it in the graph; Kaneo does not. An invalid one is dropped, never an
// error, so it cannot block a write the gateway allowed.
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

// A change (design 48 §3.2): any subset of the fields; what is omitted stays,
// null clears an optional one. The service resolves it against the stored
// value (the first time it needs the verification and `automatica` or
// `level`).
export const putAutomationInput = z
  .object({
    level: z
      .enum(AUTOMATION_LEVELS)
      .optional()
      .openapi({ description: LEVEL_DESCRIPTION }),
    automatica: z
      .boolean()
      .optional()
      .openapi({ description: AUTOMATICA_DESCRIPTION }),
    verification: z
      .boolean()
      .optional()
      .openapi({ description: VERIFICATION_DESCRIPTION }),
    ...fieldInputs,
    actor: declaredActorInput,
  })
  .superRefine(checkFields);

export const automationHistoryQuery = z.object({
  limit: pagingNumber(1, 200, 50).openapi({
    description: "Maximum number of changes, newest first.",
  }),
});
