const HOUR_MS = 3_600_000;

/** A task of the plan, in the order ties are broken (first wins). */
export type ScheduleNode = {
  id: string;
  /** In the initiative (not one of the external tasks it touches). */
  own: boolean;
  /** Neither Done nor Cancelled. */
  pending: boolean;
  remainingHours: number;
  actualStart: Date | null;
  actualEnd: Date | null;
};

export type Schedule = {
  dates: Map<string, { plannedStart: Date | null; plannedEnd: Date | null }>;
  /** Null with a cycle among the pending tasks. */
  critical: { taskIds: string[]; hours: number } | null;
  estimatedEnd: Date | null;
};

/**
 * Annex of design 19 §3.1. Pending tasks are chained from `now` along their
 * pending blockers (`edges`, blocker → blocked), each lasting its remaining
 * hours, without sharing capacity between machines. The critical path is the
 * chain of most hours that ends at the goal, if it is pending, or else at the
 * initiative's task that ends last; the plan ends when that chain does.
 */
export function buildSchedule(
  nodes: ScheduleNode[],
  edges: { from: string; to: string }[],
  now: Date,
  goalTaskId: string | null,
): Schedule {
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const pending = new Map(
    nodes.filter((node) => node.pending).map((node) => [node.id, node]),
  );
  const blockers = new Map<string, string[]>(
    [...pending.keys()].map((id) => [id, []]),
  );
  for (const { from, to } of edges) {
    if (pending.has(from)) blockers.get(to)?.push(from);
  }
  for (const list of blockers.values()) {
    list.sort((a, b) => order.get(a)! - order.get(b)!);
  }

  // Hours from now until each pending task ends; null with a cycle.
  const finish = new Map<string, number>();
  const visiting = new Set<string>();
  const finishOf = (id: string): number | null => {
    const known = finish.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return null;
    visiting.add(id);
    let start = 0;
    for (const blocker of blockers.get(id)!) {
      const end = finishOf(blocker);
      if (end === null) return null;
      start = Math.max(start, end);
    }
    visiting.delete(id);
    const end = start + pending.get(id)!.remainingHours;
    finish.set(id, end);
    return end;
  };
  const acyclic = [...pending.keys()].every((id) => finishOf(id) !== null);

  const at = (hours: number) => new Date(now.getTime() + hours * HOUR_MS);
  const dates: Schedule["dates"] = new Map();
  for (const node of nodes) {
    const end = acyclic && node.pending ? finish.get(node.id)! : null;
    dates.set(node.id, {
      plannedStart:
        node.actualStart ??
        (end === null ? null : at(end - node.remainingHours)),
      plannedEnd: end === null ? node.actualEnd : at(end),
    });
  }
  if (!acyclic) return { dates, critical: null, estimatedEnd: null };

  const latest = (ids: string[]) =>
    ids.reduce<string | null>(
      (best, id) =>
        best === null || finish.get(id)! > finish.get(best)! ? id : best,
      null,
    );
  const target =
    goalTaskId && pending.has(goalTaskId)
      ? goalTaskId
      : latest(nodes.filter((n) => n.own && n.pending).map((n) => n.id));
  if (target === null) {
    return { dates, critical: { taskIds: [], hours: 0 }, estimatedEnd: null };
  }
  const taskIds: string[] = [];
  for (let id: string | null = target; id; id = latest(blockers.get(id)!)) {
    taskIds.unshift(id);
  }
  const hours = finish.get(target)!;
  return { dates, critical: { taskIds, hours }, estimatedEnd: at(hours) };
}
