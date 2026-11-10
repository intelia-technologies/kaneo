import type { ExecutorKind } from "../../intelia/initiatives/plan/executor";
import {
  type BlockerState,
  type NotStartingReason,
  WAIT_REASONS,
  type WaitReason,
} from "./schema";

const IN_PROGRESS: Record<string, true> = {
  "in-progress": true,
  "in-review": true,
  "ready-to-merge": true,
};

export const isCancelled = (status: string) =>
  status === "cancelled" || status === "canceled";

export const isInProgress = (status: string) => IN_PROGRESS[status] === true;

/** What a visible, pending blocker needs to be classified. */
export type BlockerFacts = {
  status: string;
  assigneeKind: ExecutorKind | null;
  assigneeName: string | null;
  hasDecisionLabel: boolean;
  /** `espera_a` of its project's board signals, if any. */
  esperaA: string | null;
};

const waitsForPerson = (facts: BlockerFacts) =>
  facts.status === "blocked" && !!facts.esperaA?.startsWith("person:");

/** Design 55 §3.1: the first that applies. */
export function blockerState(facts: BlockerFacts): BlockerState {
  if (isCancelled(facts.status)) return "cancelled";
  if (
    facts.assigneeKind === "person" ||
    facts.hasDecisionLabel ||
    waitsForPerson(facts)
  )
    return "person";
  if (facts.status === "blocked") return "blocked";
  if (isInProgress(facts.status)) return "in_progress";
  return "not_started";
}

/** Who a person-state blocker waits for, when Kaneo knows. */
export function blockerPerson(facts: BlockerFacts): string | null {
  if (waitsForPerson(facts)) return facts.esperaA;
  return facts.assigneeKind === "person" ? facts.assigneeName : null;
}

/** The worst reason among the pending blockers; ready without any. */
export function worstReason(
  states: BlockerState[],
  externalCount: number,
): WaitReason {
  const present = new Set<WaitReason>(states);
  if (externalCount > 0) present.add("external");
  return WAIT_REASONS.find((reason) => present.has(reason)) ?? "ready";
}

/** Why a ready To do task will not start alone; null when it will. */
export function notStartingReason(task: {
  automatica: boolean | null;
  pausaMotivo: string | null;
  assigneeKind: ExecutorKind | null;
  waitingRelease: boolean;
}): NotStartingReason | null {
  if (!task.automatica) return task.pausaMotivo ? "paused" : "automation_off";
  if (task.assigneeKind !== "ephemeral") return "no_role";
  if (task.waitingRelease) return "waiting_release";
  return null;
}
