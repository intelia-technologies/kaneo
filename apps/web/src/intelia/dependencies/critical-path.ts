/**
 * Critical path calculation for dependency graphs.
 *
 * Rules:
 * - Weight: 1 per task (node count along directed `blocks` edges).
 * - Cycles: detected over all given tasks and edges (finished included);
 *   any cycle returns `{ kind: "cycle", taskIds: [...] }` with tasks in cycle order.
 * - Unfinished only: if acyclic, the critical path is the longest chain in the
 *   subgraph of unfinished tasks (edges with a finished endpoint dropped).
 * - Priority tie-breaking: ties broken by higher sum of task priority ranks
 *   (urgent=4, high=3, medium=2, low=1, no-priority/null/unknown=0).
 * - Determinism: remaining ties broken deterministically (lexicographically smallest ID sequence),
 *   independent of input order.
 * - Empty / lone tasks: no unfinished tasks yields an empty path; a lone unfinished
 *   task yields a chain of length 1 with no edges.
 */

export type PathTask = {
  id: string;
  priority: string | null;
  finished: boolean;
};

export type BlocksEdge = {
  source: string;
  target: string;
};

export type CriticalPathResult =
  | { kind: "path"; taskIds: string[]; edgeKeys: string[] }
  | { kind: "cycle"; taskIds: string[] };

function getPriorityRank(priority: string | null | undefined): number {
  switch (priority) {
    case "urgent":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

export function edgeKey(source: string, target: string): string {
  return `${source}->${target}`;
}

function canonicalizeCycle(cycle: string[]): string[] {
  if (cycle.length <= 1) return cycle;
  let minIdx = 0;
  for (let i = 1; i < cycle.length; i++) {
    if (cycle[i] < cycle[minIdx]) {
      minIdx = i;
    }
  }
  if (minIdx === 0) return cycle;
  return [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
}

/**
 * Returns one cycle (ids in cycle order, rotated to start at the smallest id) among nodeIds, or null.
 * Edges with an endpoint not in nodeIds are ignored; a self-loop is a 1-node cycle.
 * Iterative (no recursion), deterministic regardless of input order.
 */
export function findCycle(
  nodeIds: string[],
  edges: BlocksEdge[],
): string[] | null {
  const nodeSet = new Set(nodeIds);
  if (nodeSet.size === 0) {
    return null;
  }

  // Deduplicate edges and build outgoing / incoming adjacency sets for the induced graph
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();

  for (const id of nodeSet) {
    outgoing.set(id, new Set<string>());
    incoming.set(id, new Set<string>());
  }

  for (const edge of edges) {
    if (nodeSet.has(edge.source) && nodeSet.has(edge.target)) {
      outgoing.get(edge.source)!.add(edge.target);
      incoming.get(edge.target)!.add(edge.source);
    }
  }

  // Kahn's algorithm over the induced graph
  const inDegree = new Map<string, number>();
  const queue: string[] = [];

  for (const id of nodeSet) {
    const deg = incoming.get(id)!.size;
    inDegree.set(id, deg);
    if (deg === 0) {
      queue.push(id);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    const targets = outgoing.get(u)!;
    for (const v of targets) {
      const nextDeg = inDegree.get(v)! - 1;
      inDegree.set(v, nextDeg);
      if (nextDeg === 0) {
        queue.push(v);
      }
    }
  }

  // If all nodes had in-degree reach 0, the graph is acyclic
  if (queue.length === nodeSet.size) {
    return null;
  }

  // Remaining nodes are those whose in-degree never reached 0
  const remainingSet = new Set<string>();
  for (const id of nodeSet) {
    if (inDegree.get(id)! > 0) {
      remainingSet.add(id);
    }
  }

  // Find the deterministically smallest remaining id
  let startNode: string | null = null;
  for (const id of remainingSet) {
    if (startNode === null || id < startNode) {
      startNode = id;
    }
  }

  // Walk predecessors inside the remaining set until a node repeats
  const visitedOrder: string[] = [];
  const visitedIndex = new Map<string, number>();

  let curr = startNode!;
  while (!visitedIndex.has(curr)) {
    visitedIndex.set(curr, visitedOrder.length);
    visitedOrder.push(curr);

    // Pick the deterministically smallest predecessor in remainingSet
    let bestPred: string | null = null;
    for (const pred of incoming.get(curr)!) {
      if (remainingSet.has(pred)) {
        if (bestPred === null || pred < bestPred) {
          bestPred = pred;
        }
      }
    }

    curr = bestPred!;
  }

  // curr repeated: slice from its first occurrence
  const cycleStartIndex = visitedIndex.get(curr)!;
  const cycleReversed = visitedOrder.slice(cycleStartIndex);
  // Reversing predecessor order yields forward directed cycle order
  const forwardCycle = cycleReversed.reverse();

  return canonicalizeCycle(forwardCycle);
}

type NodeDP = {
  length: number;
  prioritySum: number;
  next: string | null;
};

function isBetterChain(
  nodeA: string,
  nodeB: string,
  dp: Map<string, NodeDP>,
): boolean {
  const a = dp.get(nodeA)!;
  const b = dp.get(nodeB)!;
  if (a.length !== b.length) {
    return a.length > b.length;
  }
  if (a.prioritySum !== b.prioritySum) {
    return a.prioritySum > b.prioritySum;
  }
  let currA: string | null = nodeA;
  let currB: string | null = nodeB;
  while (currA !== null && currB !== null) {
    if (currA !== currB) {
      return currA < currB;
    }
    currA = dp.get(currA)!.next;
    currB = dp.get(currB)!.next;
  }
  return false;
}

export function computeCriticalPath(
  tasks: PathTask[],
  edges: BlocksEdge[],
): CriticalPathResult {
  const taskMap = new Map<string, PathTask>();
  for (const task of tasks) {
    if (!taskMap.has(task.id)) {
      taskMap.set(task.id, task);
    }
  }

  const allTaskIds = Array.from(taskMap.keys());
  const cycle = findCycle(allTaskIds, edges);
  if (cycle !== null) {
    return {
      kind: "cycle",
      taskIds: cycle,
    };
  }

  // Unfinished tasks only
  const unfinishedTasks: PathTask[] = [];
  for (const task of tasks) {
    if (!task.finished && taskMap.get(task.id) === task) {
      unfinishedTasks.push(task);
    }
  }

  if (unfinishedTasks.length === 0) {
    return { kind: "path", taskIds: [], edgeKeys: [] };
  }

  const unfinishedSet = new Set(unfinishedTasks.map((t) => t.id));
  const unfinishedAdjSets = new Map<string, Set<string>>();
  const unfinishedInDegree = new Map<string, number>();

  for (const id of unfinishedSet) {
    unfinishedAdjSets.set(id, new Set<string>());
    unfinishedInDegree.set(id, 0);
  }

  for (const edge of edges) {
    if (unfinishedSet.has(edge.source) && unfinishedSet.has(edge.target)) {
      const targets = unfinishedAdjSets.get(edge.source)!;
      if (!targets.has(edge.target)) {
        targets.add(edge.target);
        unfinishedInDegree.set(
          edge.target,
          unfinishedInDegree.get(edge.target)! + 1,
        );
      }
    }
  }

  const unfinishedAdj = new Map<string, string[]>();
  for (const [id, targets] of unfinishedAdjSets) {
    unfinishedAdj.set(id, Array.from(targets));
  }

  // Iterative topological sort of unfinished tasks (Kahn's algorithm)
  const queue: string[] = [];
  for (const id of unfinishedSet) {
    if (unfinishedInDegree.get(id) === 0) {
      queue.push(id);
    }
  }

  const topoOrder: string[] = [];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    topoOrder.push(u);

    const neighbors = unfinishedAdj.get(u) ?? [];
    for (const v of neighbors) {
      const newDeg = unfinishedInDegree.get(v)! - 1;
      unfinishedInDegree.set(v, newDeg);
      if (newDeg === 0) {
        queue.push(v);
      }
    }
  }

  // DP in reverse topological order
  const dp = new Map<string, NodeDP>();

  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const u = topoOrder[i];
    const uPriority = getPriorityRank(taskMap.get(u)?.priority);

    let bestNext: string | null = null;
    const neighbors = unfinishedAdj.get(u) ?? [];
    for (const v of neighbors) {
      if (bestNext === null || isBetterChain(v, bestNext, dp)) {
        bestNext = v;
      }
    }

    const vDP = bestNext !== null ? dp.get(bestNext)! : null;
    dp.set(u, {
      length: vDP !== null ? 1 + vDP.length : 1,
      prioritySum: vDP !== null ? uPriority + vDP.prioritySum : uPriority,
      next: bestNext,
    });
  }

  // Select the best starting node
  let overallBestStart: string | null = null;
  for (const task of unfinishedTasks) {
    const id = task.id;
    if (overallBestStart === null || isBetterChain(id, overallBestStart, dp)) {
      overallBestStart = id;
    }
  }

  if (overallBestStart === null) {
    return { kind: "path", taskIds: [], edgeKeys: [] };
  }

  // Reconstruct path by following `next` pointers
  const pathTaskIds: string[] = [];
  let curr: string | null = overallBestStart;
  while (curr !== null) {
    pathTaskIds.push(curr);
    curr = dp.get(curr)!.next;
  }

  const edgeKeys: string[] = [];
  for (let i = 0; i < pathTaskIds.length - 1; i++) {
    edgeKeys.push(edgeKey(pathTaskIds[i], pathTaskIds[i + 1]));
  }

  return {
    kind: "path",
    taskIds: pathTaskIds,
    edgeKeys,
  };
}
