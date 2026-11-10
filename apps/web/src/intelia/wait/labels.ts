import type { TFunction } from "i18next";
import type {
  BlockerItem,
  BlockerState,
  BlockersSummary,
  NotStartingReason,
  WaitReason,
  WaitRoot,
} from "@/types/task/blockers-summary";
import { blockersByWorstState } from "./reasons";

// Spanish defaults, like the rest of the readiness chips (`tasks:readiness`).
const REASON_DEFAULTS: Record<WaitReason, string> = {
  cancelled: "Bloqueante cancelado",
  person: "Espera a una persona",
  blocked: "Bloqueante bloqueado",
  not_started: "Bloqueante sin empezar",
  external: "Espera a otro proyecto",
  in_progress: "Bloqueante en curso",
  ready: "Lista para empezar",
};

const STATE_DEFAULTS: Record<BlockerState, string> = {
  in_progress: "en curso",
  not_started: "sin empezar",
  blocked: "bloqueado",
  person: "espera a una persona",
  cancelled: "cancelado",
};

const NOT_STARTING_DEFAULTS: Record<NotStartingReason, string> = {
  paused: "pausada",
  automation_off: "automatización apagada",
  no_role: "sin rol asignado",
  waiting_release: "espera release",
};

const ROOT_DEFAULTS: Record<Exclude<WaitRoot["kind"], "task">, string> = {
  external: "otro proyecto",
  cycle: "ciclo",
  too_deep: "más de 20 niveles",
};

export function reasonLabel(t: TFunction, reason: WaitReason): string {
  return t(`tasks:readiness.reason.${reason}`, {
    defaultValue: REASON_DEFAULTS[reason],
  });
}

export function stateLabel(t: TFunction, state: BlockerState): string {
  return t(`tasks:readiness.state.${state}`, {
    defaultValue: STATE_DEFAULTS[state],
  });
}

/** A blocker in the detail: ticket, title, state and whom it waits for. */
export function blockerLine(t: TFunction, blocker: BlockerItem): string {
  const state = stateLabel(t, blocker.state);
  return `${blocker.ticket} ${blocker.title} · ${blocker.person ? `${state}: ${blocker.person}` : state}`;
}

export function notStartingLabel(
  t: TFunction,
  summary: Pick<BlockersSummary, "notStartingReason" | "pauseReason">,
): string | null {
  const reason = summary.notStartingReason;
  if (!reason) return null;
  const label = t(`tasks:readiness.notStarting.${reason}`, {
    defaultValue: NOT_STARTING_DEFAULTS[reason],
  });
  return reason === "paused" && summary.pauseReason
    ? `${label} (${summary.pauseReason})`
    : label;
}

export function externalLabel(t: TFunction, count: number): string {
  return t("tasks:readiness.external", {
    count,
    defaultValue: "{{count}} de otro proyecto",
  });
}

/** The chip's text: the worst reason and the blockers that cause it. */
export function waitLabel(t: TFunction, summary: BlockersSummary): string {
  const reason = reasonLabel(t, summary.reason);
  if (summary.reason === "ready") {
    const notStarting = notStartingLabel(t, summary);
    return notStarting ? `${reason} · ${notStarting}` : reason;
  }
  const tickets = blockersByWorstState(summary.blockers)
    .map((blocker) => blocker.ticket)
    .join(", ");
  const external =
    summary.externalCount > 0 ? externalLabel(t, summary.externalCount) : "";
  const names = [tickets, external].filter(Boolean).join(" y ");
  return names ? `${reason}: ${names}` : reason;
}

/** The root column's text: its ticket, or why there is none. */
export function rootLabel(t: TFunction, root: WaitRoot): string {
  if (root.kind === "task") return root.task?.ticket ?? "";
  return t(`tasks:readiness.root.${root.kind}`, {
    defaultValue: ROOT_DEFAULTS[root.kind],
  });
}
