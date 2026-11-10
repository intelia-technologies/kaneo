import { z } from "../../openapi";

// Design 55 §3.1 (software-factory): how a pending blocker stands.
export const BLOCKER_STATES = [
  "in_progress",
  "not_started",
  "blocked",
  "person",
  "cancelled",
] as const;
export type BlockerState = (typeof BLOCKER_STATES)[number];

// The worst reason first: what the label shows.
export const WAIT_REASONS = [
  "cancelled",
  "person",
  "blocked",
  "not_started",
  "external",
  "in_progress",
  "ready",
] as const;
export type WaitReason = (typeof WAIT_REASONS)[number];

export const NOT_STARTING_REASONS = [
  "paused",
  "automation_off",
  "no_role",
  "waiting_release",
] as const;
export type NotStartingReason = (typeof NOT_STARTING_REASONS)[number];

export const ROOT_KINDS = ["task", "external", "cycle", "too_deep"] as const;
export type RootKind = (typeof ROOT_KINDS)[number];

const STATE_DESCRIPTION =
  "in_progress: In progress, In review or Ready to merge. not_started: Backlog, To do, Queued or another open column. blocked: Blocked by something other than a person. person: assigned to a person, labelled `decision`, or Blocked waiting for a person (`espera_a` of the board signals). cancelled: never fulfils the dependency.";

const blockerSchema = z.object({
  id: z.string(),
  ticket: z.string(),
  status: z.string(),
  title: z.string(),
  state: z.enum(BLOCKER_STATES).openapi({ description: STATE_DESCRIPTION }),
  person: z.string().nullable().openapi({
    description:
      "Who it waits for when `state` is person: the assignee's name, or the `espera_a` of the board signals (`person:…`). Null otherwise, when unknown, and on public boards.",
  }),
});

export const blockersSummarySchema = z
  .object({
    pendingCount: z.number().int().nonnegative().openapi({
      description:
        "Blockers not in Done, including cancelled ones and those of projects the reader cannot see.",
    }),
    hasCancelledBlocker: z.boolean(),
    waitingRelease: z.boolean(),
    blockers: z.array(blockerSchema).openapi({
      description:
        "Visible pending blockers. Those of projects the reader cannot see only add to `externalCount`, without title or status.",
    }),
    externalCount: z.number().int().nonnegative(),
    byState: z
      .object({
        in_progress: z.number().int().nonnegative(),
        not_started: z.number().int().nonnegative(),
        blocked: z.number().int().nonnegative(),
        person: z.number().int().nonnegative(),
        cancelled: z.number().int().nonnegative(),
      })
      .openapi({
        description: `Visible pending blockers by state; with \`externalCount\` they add up to \`pendingCount\`. ${STATE_DESCRIPTION}`,
      }),
    reason: z.enum(WAIT_REASONS).openapi({
      description:
        "The worst reason, which sets the label's colour: cancelled and person red; blocked, not_started and external (pending in a project the reader cannot see) yellow; in_progress blue; ready (no pending blockers) green.",
    }),
    notStartingReason: z.enum(NOT_STARTING_REASONS).nullable().openapi({
      description:
        "Only for a ready task in To do: why the dispatcher will not start it alone. paused: automation off with a pause reason; automation_off: automation off or never set; no_role: not assigned to a role's account; waiting_release: a validation whose `release` is not `desplegada`. Null otherwise. Informative: the dispatcher decides.",
    }),
    pauseReason: z.string().nullable().openapi({
      description:
        "The pause reason when `notStartingReason` is paused; null otherwise and on public boards.",
    }),
    root: z
      .object({
        kind: z.enum(ROOT_KINDS).openapi({
          description:
            "task: the first task up the pending blockers that waits for no other pending task (several: the one in progress, then the highest priority, then the oldest). external: that task is in a project the reader cannot see. cycle: the pending blockers loop, so there is no root. too_deep: no root within 20 levels.",
        }),
        task: blockerSchema.nullable().openapi({
          description: "The root when `kind` is task; null otherwise.",
        }),
        depth: z.number().int().positive().nullable().openapi({
          description:
            "Levels from the task to the root (1: a direct blocker); null for cycle and too_deep.",
        }),
      })
      .nullable()
      .openapi({
        description:
          "Only for a task in To do with pending blockers; null otherwise.",
      }),
  })
  .openapi("BlockersSummary", {
    description:
      "Why a task waits (Intelia fork, design 55 §3.1). Only Done fulfils a dependency. Informative: it does not authorize a start.",
  });

export type BlockersSummary = z.infer<typeof blockersSummarySchema>;
export type BlockerItem = BlockersSummary["blockers"][number];
