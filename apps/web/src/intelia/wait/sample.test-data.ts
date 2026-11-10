import type {
  BlockerItem,
  BlockersSummary,
  WaitReason,
} from "@/types/task/blockers-summary";

// The contract sample of ES-01 (KF-6, PR #54): a real `getTasks` response.
export const waitingOnPerson: BlockersSummary = {
  pendingCount: 2,
  hasCancelledBlocker: false,
  waitingRelease: false,
  blockers: [
    {
      id: "q87ifv8tubyh7g5d0row14ud",
      ticket: "KF-2",
      status: "in-progress",
      title: "Resumen en la API",
      state: "in_progress",
      person: null,
    },
    {
      id: "c4s2dzsd7bgxh1jdhimbw61m",
      ticket: "KF-3",
      status: "blocked",
      title: "Decidir colores",
      state: "person",
      person: "person:pablo",
    },
  ],
  externalCount: 0,
  byState: {
    in_progress: 1,
    not_started: 0,
    blocked: 0,
    person: 1,
    cancelled: 0,
  },
  reason: "person",
  notStartingReason: null,
  pauseReason: null,
  root: {
    kind: "task",
    task: {
      id: "tziedxd6givy2as2d10mabit",
      ticket: "KF-4",
      status: "in-review",
      title: "Aprobar diseño",
      state: "person",
      person: "Jaime",
    },
    depth: 2,
  },
};

export const readyButPaused: BlockersSummary = {
  pendingCount: 0,
  hasCancelledBlocker: false,
  waitingRelease: false,
  blockers: [],
  externalCount: 0,
  byState: {
    in_progress: 0,
    not_started: 0,
    blocked: 0,
    person: 0,
    cancelled: 0,
  },
  reason: "ready",
  notStartingReason: "paused",
  pauseReason: "movida_a_mano",
  root: null,
};

const blocker = (
  ticket: string,
  state: BlockerItem["state"],
  status: string,
): BlockerItem => ({
  id: ticket,
  ticket,
  status,
  title: `Tarea ${ticket}`,
  state,
  person: null,
});

/** One summary per reason, built on the sample's shape. */
export const summaryByReason: Record<WaitReason, BlockersSummary> = {
  cancelled: {
    ...waitingOnPerson,
    pendingCount: 1,
    hasCancelledBlocker: true,
    blockers: [blocker("KF-10", "cancelled", "cancelled")],
    byState: { ...readyButPaused.byState, cancelled: 1 },
    reason: "cancelled",
    root: {
      kind: "task",
      task: blocker("KF-10", "cancelled", "cancelled"),
      depth: 1,
    },
  },
  person: waitingOnPerson,
  blocked: {
    ...waitingOnPerson,
    pendingCount: 1,
    blockers: [blocker("KF-11", "blocked", "blocked")],
    byState: { ...readyButPaused.byState, blocked: 1 },
    reason: "blocked",
    root: { kind: "cycle", task: null, depth: null },
  },
  not_started: {
    ...waitingOnPerson,
    pendingCount: 1,
    blockers: [blocker("KF-12", "not_started", "to-do")],
    byState: { ...readyButPaused.byState, not_started: 1 },
    reason: "not_started",
    root: {
      kind: "task",
      task: blocker("KF-12", "not_started", "to-do"),
      depth: 1,
    },
  },
  external: {
    ...waitingOnPerson,
    pendingCount: 1,
    blockers: [],
    externalCount: 1,
    byState: readyButPaused.byState,
    reason: "external",
    root: { kind: "external", task: null, depth: null },
  },
  in_progress: {
    ...waitingOnPerson,
    pendingCount: 1,
    blockers: [blocker("KF-13", "in_progress", "in-progress")],
    byState: { ...readyButPaused.byState, in_progress: 1 },
    reason: "in_progress",
    root: {
      kind: "task",
      task: blocker("KF-13", "in_progress", "in-progress"),
      depth: 1,
    },
  },
  ready: { ...readyButPaused, notStartingReason: null, pauseReason: null },
};
