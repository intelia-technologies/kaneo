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

const enum VisitState {
  Unvisited = 0,
  Visiting = 1,
  Visited = 2,
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

type PathInfo = {
  taskIds: string[];
  prioritySum: number;
};

function isBetterPath(candidate: PathInfo, currentBest: PathInfo): boolean {
  if (candidate.taskIds.length !== currentBest.taskIds.length) {
    return candidate.taskIds.length > currentBest.taskIds.length;
  }
  if (candidate.prioritySum !== currentBest.prioritySum) {
    return candidate.prioritySum > currentBest.prioritySum;
  }
  const len = candidate.taskIds.length;
  for (let i = 0; i < len; i++) {
    if (candidate.taskIds[i] !== currentBest.taskIds[i]) {
      return candidate.taskIds[i] < currentBest.taskIds[i];
    }
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

  // Edges with an endpoint not in tasks are ignored
  const fullAdjSets = new Map<string, Set<string>>();
  for (const id of taskMap.keys()) {
    fullAdjSets.set(id, new Set<string>());
  }
  for (const edge of edges) {
    if (taskMap.has(edge.source) && taskMap.has(edge.target)) {
      fullAdjSets.get(edge.source)!.add(edge.target);
    }
  }

  const fullAdj = new Map<string, string[]>();
  for (const [id, neighbors] of fullAdjSets) {
    fullAdj.set(id, Array.from(neighbors).sort());
  }

  // Cycle detection over ALL given tasks and edges (finished included)
  const state = new Map<string, VisitState>();
  for (const id of taskMap.keys()) {
    state.set(id, VisitState.Unvisited);
  }

  const stack: string[] = [];
  let detectedCycle: string[] | null = null;

  function dfs(u: string): boolean {
    state.set(u, VisitState.Visiting);
    stack.push(u);

    const neighbors = fullAdj.get(u) ?? [];
    for (const v of neighbors) {
      if (v === u) {
        detectedCycle = [u];
        return true;
      }
      const vState = state.get(v);
      if (vState === VisitState.Visiting) {
        const idx = stack.indexOf(v);
        if (idx !== -1) {
          detectedCycle = stack.slice(idx);
          return true;
        }
      } else if (vState === VisitState.Unvisited) {
        if (dfs(v)) {
          return true;
        }
      }
    }

    stack.pop();
    state.set(u, VisitState.Visited);
    return false;
  }

  const sortedAllIds = Array.from(taskMap.keys()).sort();
  for (const id of sortedAllIds) {
    if (state.get(id) === VisitState.Unvisited) {
      if (dfs(id)) {
        return {
          kind: "cycle",
          taskIds: canonicalizeCycle(detectedCycle!),
        };
      }
    }
  }

  // Unfinished subgraph only
  const unfinishedTasks: PathTask[] = [];
  for (const task of tasks) {
    if (!task.finished && taskMap.get(task.id) === task) {
      unfinishedTasks.push(task);
    }
  }

  if (unfinishedTasks.length === 0) {
    return { kind: "path", taskIds: [], edgeKeys: [] };
  }

  const unfinishedTaskSet = new Set(unfinishedTasks.map((t) => t.id));
  const unfinishedAdj = new Map<string, string[]>();
  for (const task of unfinishedTasks) {
    const rawNeighbors = fullAdj.get(task.id) ?? [];
    const filtered = rawNeighbors.filter((v) => unfinishedTaskSet.has(v));
    unfinishedAdj.set(task.id, filtered);
  }

  // Topological DP on DAG of unfinished tasks
  const memo = new Map<string, PathInfo>();

  function getBestPathFrom(u: string): PathInfo {
    const cached = memo.get(u);
    if (cached) return cached;

    const uPriority = getPriorityRank(taskMap.get(u)?.priority);
    let bestFromU: PathInfo = {
      taskIds: [u],
      prioritySum: uPriority,
    };

    const neighbors = unfinishedAdj.get(u) ?? [];
    for (const v of neighbors) {
      const nextPath = getBestPathFrom(v);
      const candidate: PathInfo = {
        taskIds: [u, ...nextPath.taskIds],
        prioritySum: uPriority + nextPath.prioritySum,
      };
      if (isBetterPath(candidate, bestFromU)) {
        bestFromU = candidate;
      }
    }

    memo.set(u, bestFromU);
    return bestFromU;
  }

  let overallBest: PathInfo | null = null;
  for (const task of unfinishedTasks) {
    const path = getBestPathFrom(task.id);
    if (!overallBest || isBetterPath(path, overallBest)) {
      overallBest = path;
    }
  }

  if (!overallBest) {
    return { kind: "path", taskIds: [], edgeKeys: [] };
  }

  const edgeKeys: string[] = [];
  for (let i = 0; i < overallBest.taskIds.length - 1; i++) {
    edgeKeys.push(edgeKey(overallBest.taskIds[i], overallBest.taskIds[i + 1]));
  }

  return {
    kind: "path",
    taskIds: overallBest.taskIds,
    edgeKeys,
  };
}
