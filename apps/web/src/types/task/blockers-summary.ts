// Mirrors the API's `BlockersSummary` (apps/api/src/task/blockers-summary/schema.ts,
// design 55 §3.1).
export type BlockerState =
  | "in_progress"
  | "not_started"
  | "blocked"
  | "person"
  | "cancelled";

export type WaitReason =
  | "cancelled"
  | "person"
  | "blocked"
  | "not_started"
  | "external"
  | "in_progress"
  | "ready";

export type NotStartingReason =
  | "paused"
  | "automation_off"
  | "no_role"
  | "waiting_release";

export type BlockerItem = {
  id: string;
  ticket: string;
  status: string;
  title: string;
  state: BlockerState;
  person: string | null;
};

export type WaitRoot = {
  kind: "task" | "external" | "cycle" | "too_deep";
  task: BlockerItem | null;
  depth: number | null;
};

export type BlockersSummary = {
  pendingCount: number;
  hasCancelledBlocker: boolean;
  waitingRelease: boolean;
  blockers: BlockerItem[];
  externalCount: number;
  byState: Record<BlockerState, number>;
  reason: WaitReason;
  notStartingReason: NotStartingReason | null;
  pauseReason: string | null;
  root: WaitRoot | null;
};
