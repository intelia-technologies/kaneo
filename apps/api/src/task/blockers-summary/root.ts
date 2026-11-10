import type { RootKind } from "./schema";
import { isCancelled, isInProgress } from "./state";

export const MAX_ROOT_DEPTH = 20;

/** A pending blocker in the chain: visible and not Done, or hidden. */
export type ChainNode = {
  id: string;
  visible: boolean;
  /** Only meaningful when visible. */
  status: string;
  priority: string;
  createdAt: Date;
};

export type RootResult = {
  kind: RootKind;
  /** The root task when kind is task or external. */
  nodeId: string | null;
  depth: number | null;
};

const PRIORITY_RANK: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// Several roots: the visible one in progress, then the highest priority, then
// the oldest; a hidden one last, since nothing of it can be compared.
function compareRoots(a: ChainNode, b: ChainNode) {
  if (a.visible !== b.visible) return a.visible ? -1 : 1;
  if (!a.visible) return a.id.localeCompare(b.id);
  const progress =
    Number(isInProgress(b.status)) - Number(isInProgress(a.status));
  if (progress) return progress;
  const priority =
    (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
  if (priority) return priority;
  const age = a.createdAt.getTime() - b.createdAt.getTime();
  return age || a.id.localeCompare(b.id);
}

/**
 * Design 55 §3.1: up the pending blockers of `startId`, the first task that
 * waits for no other pending one. A hidden task is opaque and a cancelled one
 * waits for nothing, so both end a branch. A loop means no root.
 */
export function findRoot(
  startId: string,
  blockersOf: ReadonlyMap<string, readonly ChainNode[]>,
): RootResult {
  const depthOf = new Map<string, number>([[startId, 0]]);
  const expanded = new Set<string>();
  const leaves: { node: ChainNode; depth: number }[] = [];
  let truncated = false;
  const queue = [startId];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head]!;
    const depth = depthOf.get(id)!;
    const blockers = blockersOf.get(id) ?? [];
    if (depth === MAX_ROOT_DEPTH) {
      if (blockers.length) truncated = true;
      continue;
    }
    expanded.add(id);
    for (const blocker of blockers) {
      if (depthOf.has(blocker.id)) continue;
      depthOf.set(blocker.id, depth + 1);
      const waits =
        blocker.visible &&
        !isCancelled(blocker.status) &&
        (blockersOf.get(blocker.id)?.length ?? 0) > 0;
      if (waits) queue.push(blocker.id);
      else leaves.push({ node: blocker, depth: depth + 1 });
    }
  }

  if (hasCycle(startId, expanded, blockersOf)) {
    return { kind: "cycle", nodeId: null, depth: null };
  }
  const best = leaves.sort((a, b) => compareRoots(a.node, b.node))[0];
  if (!best) {
    return {
      kind: truncated ? "too_deep" : "cycle",
      nodeId: null,
      depth: null,
    };
  }
  return {
    kind: best.node.visible ? "task" : "external",
    nodeId: best.node.id,
    depth: best.depth,
  };
}

// Iterative DFS over the expanded tasks: a back edge closes a loop.
function hasCycle(
  startId: string,
  expanded: ReadonlySet<string>,
  blockersOf: ReadonlyMap<string, readonly ChainNode[]>,
) {
  const done = new Set<string>();
  const onPath = new Set<string>();
  const stack: { id: string; next: number }[] = [{ id: startId, next: 0 }];
  onPath.add(startId);
  while (stack.length) {
    const frame = stack[stack.length - 1]!;
    const blockers = blockersOf.get(frame.id) ?? [];
    if (frame.next === blockers.length) {
      stack.pop();
      onPath.delete(frame.id);
      done.add(frame.id);
      continue;
    }
    const { id } = blockers[frame.next++]!;
    if (!expanded.has(id) || done.has(id)) continue;
    if (onPath.has(id)) return true;
    onPath.add(id);
    stack.push({ id, next: 0 });
  }
  return false;
}
