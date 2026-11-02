import dagre from "@dagrejs/dagre";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type Task from "@/types/task";
import {
  computeCriticalPath,
  edgeKey,
  findCycle,
  type CriticalPathResult,
} from "./critical-path";
import type {
  ExternalNodeData,
  GraphColumn,
  ProjectRelation,
  ProjectRelationExternalTask,
  TaskNodeData,
} from "./types";

export type FrontierTask = {
  id: string;
  number?: number | null;
  title?: string;
  status?: string;
  projectId?: string;
  projectSlug?: string;
  projectName?: string;
  initiativeId?: string | null;
  initiativeName?: string | null;
  isCompleted?: boolean;
};

export type GraphScope = {
  taskIds: Set<string>;
  frontier?: FrontierTask[] | Map<string, FrontierTask>;
  initiativeNames?: Map<string, string>;
};

export type BuildGraphModelOptions = {
  tasks: Task[];
  columns: GraphColumn[];
  filteredTaskIds: Set<string>;
  relations: ProjectRelation[];
  externalTasks: ProjectRelationExternalTask[];
  showLoose: boolean;
  projectSlug: string;
  workspaceId: string;
  onOpenTask: (taskId: string) => void;
  scope?: GraphScope;
  showCancelled?: boolean;
};

export type GraphModelResult = {
  nodes: Node[];
  edges: Edge[];
  critical: {
    kind: "path" | "cycle";
    taskIds: string[];
    edgeKeys: string[];
  };
  hasCycle: boolean;
  cycleTaskNames: string[];
  totalProjectTasks: number;
  filteredProjectTasks: number;
  visibleProjectTasks: number;
  hasVisibleNodes: boolean;
};

const PROJECT_NODE_WIDTH = 220;
const PROJECT_NODE_HEIGHT = 80;
const EXTERNAL_NODE_WIDTH = 180;
const EXTERNAL_NODE_HEIGHT = 64;

export function resolveTaskColumn(
  task: Task,
  columnsBySlug: Map<string, GraphColumn>,
): GraphColumn | undefined {
  if (!task.status) return undefined;
  return columnsBySlug.get(task.status);
}

export function isTaskFinal(
  task: Task,
  columnsBySlug: Map<string, GraphColumn>,
): boolean {
  const col = resolveTaskColumn(task, columnsBySlug);
  return Boolean(col?.isFinal);
}

export function isTaskCancelled(
  task: Task,
  columnsBySlug: Map<string, GraphColumn>,
): boolean {
  const col = resolveTaskColumn(task, columnsBySlug);
  if (col) {
    if (!col.isFinal) return false;
    const slug = col.slug.toLowerCase();
    return slug === "cancelled" || slug === "canceled";
  }
  const slug = (task.status ?? "").toLowerCase();
  return slug === "cancelled" || slug === "canceled";
}

export function isExternalTaskCancelled(status: string): boolean {
  const s = status.toLowerCase();
  return s === "cancelled" || s === "canceled";
}

export function isTaskDone(
  task: Task,
  columnsBySlug: Map<string, GraphColumn>,
): boolean {
  const col = resolveTaskColumn(task, columnsBySlug);
  if (!col?.isFinal) return false;
  const slug = col.slug.toLowerCase();
  return slug !== "cancelled" && slug !== "canceled";
}

export function checkIsBlocked(
  task: Task,
  columnsBySlug: Map<string, GraphColumn>,
  incomingBlocks: ProjectRelation[],
  allTasksById: Map<string, Task>,
  externalTasksById: Map<string, { isCompleted: boolean; status?: string }>,
): boolean {
  // A finished task (final column) is never marked blocked
  if (isTaskFinal(task, columnsBySlug)) {
    return false;
  }

  const col = resolveTaskColumn(task, columnsBySlug);
  if (col?.slug.toLowerCase() === "blocked") {
    return true;
  }

  for (const relation of incomingBlocks) {
    const sourceProjectTask = allTasksById.get(relation.sourceTaskId);
    if (sourceProjectTask) {
      if (!isTaskFinal(sourceProjectTask, columnsBySlug)) {
        return true;
      }
      continue;
    }

    const sourceExternalTask = externalTasksById.get(relation.sourceTaskId);
    if (sourceExternalTask) {
      if (!sourceExternalTask.isCompleted) {
        return true;
      }
    }
  }

  return false;
}

export function buildGraphModel({
  tasks,
  columns,
  filteredTaskIds,
  relations,
  externalTasks,
  showLoose,
  projectSlug,
  workspaceId,
  onOpenTask,
  scope,
  showCancelled,
}: BuildGraphModelOptions): GraphModelResult {
  const shouldShowCancelled =
    showCancelled !== undefined ? showCancelled : scope ? false : true;

  const columnsBySlug = new Map<string, GraphColumn>();
  for (const col of columns) {
    columnsBySlug.set(col.slug, col);
  }

  const allTasksById = new Map<string, Task>();
  for (const task of tasks) {
    allTasksById.set(task.id, task);
  }

  // Build unified frontier map
  type UnifiedFrontier = {
    id: string;
    number: number | null;
    title: string;
    status: string;
    projectId: string;
    projectSlug: string;
    projectName: string;
    initiativeId: string | null;
    initiativeName: string | null;
    sameProject: boolean;
    isCompleted: boolean;
  };

  const frontierMap = new Map<string, UnifiedFrontier>();

  // 1. From externalTasks (usually cross-project)
  for (const ext of externalTasks) {
    frontierMap.set(ext.id, {
      id: ext.id,
      number: ext.number,
      title: ext.title,
      status: ext.status,
      projectId: ext.projectId,
      projectSlug: ext.projectSlug,
      projectName: ext.projectName,
      initiativeId: null,
      initiativeName: null,
      sameProject: false,
      isCompleted: ext.isCompleted,
    });
  }

  // 2. From tasks in the same project that are outside the scope
  if (scope) {
    for (const task of tasks) {
      if (!scope.taskIds.has(task.id)) {
        frontierMap.set(task.id, {
          id: task.id,
          number: task.number,
          title: task.title,
          status: task.status,
          projectId: task.projectId ?? "",
          projectSlug,
          projectName: "",
          initiativeId: null,
          initiativeName: null,
          sameProject: true,
          isCompleted: isTaskDone(task, columnsBySlug),
        });
      }
    }
  }

  // 3. From scope.frontier (explicit frontier items with initiative details)
  if (scope?.frontier) {
    const frontierItems = Array.isArray(scope.frontier)
      ? scope.frontier
      : Array.from(scope.frontier.values());
    for (const item of frontierItems) {
      const existing = frontierMap.get(item.id);
      const initName =
        item.initiativeName ??
        (item.initiativeId
          ? scope.initiativeNames?.get(item.initiativeId)
          : null) ??
        null;
      frontierMap.set(item.id, {
        id: item.id,
        number: item.number ?? existing?.number ?? null,
        title: item.title ?? existing?.title ?? "",
        status: item.status ?? existing?.status ?? "",
        projectId: item.projectId ?? existing?.projectId ?? "",
        projectSlug: item.projectSlug ?? existing?.projectSlug ?? projectSlug,
        projectName: item.projectName ?? existing?.projectName ?? "",
        initiativeId: item.initiativeId ?? existing?.initiativeId ?? null,
        initiativeName: initName ?? existing?.initiativeName ?? null,
        sameProject:
          item.projectId !== undefined && item.projectId !== ""
            ? item.projectId === (tasks[0]?.projectId ?? item.projectId)
            : (existing?.sameProject ?? true),
        isCompleted:
          item.isCompleted ??
          existing?.isCompleted ??
          (item.status ? item.status.toLowerCase() === "done" : false),
      });
    }
  }

  // Group incoming blocks relations by target task id (for blocked checks)
  const incomingBlocksByTarget = new Map<string, ProjectRelation[]>();
  for (const relation of relations) {
    if (relation.relationType !== "blocks") continue;
    const list = incomingBlocksByTarget.get(relation.targetTaskId);
    if (list) {
      list.push(relation);
    } else {
      incomingBlocksByTarget.set(relation.targetTaskId, [relation]);
    }
  }

  // 1. Candidate project tasks (pass filter bar and scope)
  const candidateProjectTasks = tasks.filter((task) => {
    if (scope && !scope.taskIds.has(task.id)) {
      return false;
    }
    if (!filteredTaskIds.has(task.id)) {
      return false;
    }
    if (!shouldShowCancelled && isTaskCancelled(task, columnsBySlug)) {
      return false;
    }
    return true;
  });
  const candidateProjectTaskIds = new Set(
    candidateProjectTasks.map((task) => task.id),
  );

  // 2. Visible external tasks: must have a blocks relation with a candidate project task
  const visibleExternalTaskIds = new Set<string>();
  for (const relation of relations) {
    if (relation.relationType !== "blocks") continue;
    const isSourceCandidate = candidateProjectTaskIds.has(
      relation.sourceTaskId,
    );
    const isTargetCandidate = candidateProjectTaskIds.has(
      relation.targetTaskId,
    );

    if (isSourceCandidate && frontierMap.has(relation.targetTaskId)) {
      const ext = frontierMap.get(relation.targetTaskId)!;
      if (shouldShowCancelled || !isExternalTaskCancelled(ext.status)) {
        visibleExternalTaskIds.add(relation.targetTaskId);
      }
    }
    if (isTargetCandidate && frontierMap.has(relation.sourceTaskId)) {
      const ext = frontierMap.get(relation.sourceTaskId)!;
      if (shouldShowCancelled || !isExternalTaskCancelled(ext.status)) {
        visibleExternalTaskIds.add(relation.sourceTaskId);
      }
    }
  }

  // 3. Drawn edges candidates (only blocks, both ends visible among candidates)
  const allCandidateNodeIds = new Set<string>([
    ...candidateProjectTaskIds,
    ...visibleExternalTaskIds,
  ]);

  type RawEdge = {
    id: string;
    source: string;
    target: string;
  };

  const candidateEdges: RawEdge[] = [];
  const connectedNodeIds = new Set<string>();

  for (const relation of relations) {
    if (relation.relationType !== "blocks") continue;
    if (
      allCandidateNodeIds.has(relation.sourceTaskId) &&
      allCandidateNodeIds.has(relation.targetTaskId)
    ) {
      candidateEdges.push({
        id: edgeKey(relation.sourceTaskId, relation.targetTaskId),
        source: relation.sourceTaskId,
        target: relation.targetTaskId,
      });
      connectedNodeIds.add(relation.sourceTaskId);
      connectedNodeIds.add(relation.targetTaskId);
    }
  }

  // 4. Determine final displayed project tasks (loose filtering)
  const displayedProjectTasks = candidateProjectTasks.filter((task) => {
    const hasDrawnEdge = connectedNodeIds.has(task.id);
    if (!hasDrawnEdge && !showLoose) {
      return false;
    }
    return true;
  });

  const displayedProjectTaskIds = new Set(
    displayedProjectTasks.map((t) => t.id),
  );

  const displayedExternalTasks = Array.from(visibleExternalTaskIds)
    .map((id) => frontierMap.get(id)!)
    .filter(Boolean);

  const displayedExternalTaskIds = new Set(
    displayedExternalTasks.map((e) => e.id),
  );

  const finalNodeIds = new Set<string>([
    ...displayedProjectTaskIds,
    ...displayedExternalTaskIds,
  ]);

  // Filter edges to only those whose endpoints are in final displayed nodes
  const finalEdgesRaw = candidateEdges.filter(
    (e) => finalNodeIds.has(e.source) && finalNodeIds.has(e.target),
  );

  // 5. The cycle check covers every drawn node (external ones included) and
  // edge; the critical path runs over all drawn non-final tasks.
  const cycle = findCycle(
    Array.from(finalNodeIds),
    finalEdgesRaw.map((e) => ({ source: e.source, target: e.target })),
  );

  const allPathTasks = scope
    ? [
        ...displayedProjectTasks.map((task) => ({
          id: task.id,
          priority: task.priority ?? null,
          finished: isTaskFinal(task, columnsBySlug),
        })),
        ...displayedExternalTasks.map((ext) => ({
          id: ext.id,
          priority: null,
          finished:
            ext.isCompleted ||
            isExternalTaskCancelled(ext.status) ||
            ext.status.toLowerCase() === "done",
        })),
      ]
    : displayedProjectTasks.map((task) => ({
        id: task.id,
        priority: task.priority ?? null,
        finished: isTaskFinal(task, columnsBySlug),
      }));

  const pathEdges = scope
    ? finalEdgesRaw
    : finalEdgesRaw.filter(
        (e) =>
          displayedProjectTaskIds.has(e.source) &&
          displayedProjectTaskIds.has(e.target),
      );

  const criticalResult: CriticalPathResult = cycle
    ? { kind: "cycle", taskIds: cycle }
    : computeCriticalPath(allPathTasks, pathEdges);

  let hasCycle = false;
  let cycleTaskNames: string[] = [];
  const criticalTaskIds = new Set<string>();
  const criticalEdgeKeys = new Set<string>();

  if (criticalResult.kind === "cycle") {
    hasCycle = true;
    cycleTaskNames = criticalResult.taskIds.map((id) => {
      const task = allTasksById.get(id);
      if (task) {
        return task.number !== null
          ? `${projectSlug}-${task.number} ${task.title}`
          : task.title;
      }
      const ext = frontierMap.get(id);
      if (ext) {
        return ext.number !== null
          ? `${ext.projectSlug}-${ext.number} ${ext.title}`
          : ext.title;
      }
      return id;
    });
  } else {
    for (const id of criticalResult.taskIds) {
      criticalTaskIds.add(id);
    }
    for (const key of criticalResult.edgeKeys) {
      criticalEdgeKeys.add(key);
    }
  }

  // 6. Dagre Layout
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    nodesep: 20,
    ranksep: 35,
    marginx: 24,
    marginy: 24,
  });

  for (const task of displayedProjectTasks) {
    g.setNode(task.id, {
      width: PROJECT_NODE_WIDTH,
      height: PROJECT_NODE_HEIGHT,
    });
  }

  for (const ext of displayedExternalTasks) {
    g.setNode(ext.id, {
      width: EXTERNAL_NODE_WIDTH,
      height: EXTERNAL_NODE_HEIGHT,
    });
  }

  for (const edge of finalEdgesRaw) {
    g.setEdge(edge.source, edge.target);
  }

  if (finalNodeIds.size > 0) {
    dagre.layout(g);
  }

  const criticalLabel = scope ? "Cadena pendiente más larga" : undefined;

  // 7. Build @xyflow nodes
  const nodes: Node[] = [];

  for (const task of displayedProjectTasks) {
    const col = resolveTaskColumn(task, columnsBySlug);
    const incoming = incomingBlocksByTarget.get(task.id) ?? [];
    const isBlocked = checkIsBlocked(
      task,
      columnsBySlug,
      incoming,
      allTasksById,
      frontierMap,
    );
    const isCancelled = isTaskCancelled(task, columnsBySlug);
    const isDone = isTaskDone(task, columnsBySlug);
    const isCritical = criticalTaskIds.has(task.id);

    const gNode = g.node(task.id);
    const x = gNode ? gNode.x - PROJECT_NODE_WIDTH / 2 : 0;
    const y = gNode ? gNode.y - PROJECT_NODE_HEIGHT / 2 : 0;

    const nodeData: TaskNodeData = {
      id: task.id,
      number: task.number,
      title: task.title,
      status: task.status,
      statusLabel: col?.name ?? task.status,
      columnColor: col?.color ?? null,
      assigneeName: task.assigneeName ?? null,
      assigneeImage: task.assigneeImage ?? null,
      projectSlug,
      isBlocked,
      isDone,
      isCancelled,
      isCritical,
      onOpen: onOpenTask,
      criticalLabel,
    };

    nodes.push({
      id: task.id,
      type: "projectTask",
      position: { x, y },
      data: nodeData,
      draggable: true,
      selectable: true,
      connectable: false,
    });
  }

  for (const ext of displayedExternalTasks) {
    const gNode = g.node(ext.id);
    const x = gNode ? gNode.x - EXTERNAL_NODE_WIDTH / 2 : 0;
    const y = gNode ? gNode.y - EXTERNAL_NODE_HEIGHT / 2 : 0;

    const nodeData: ExternalNodeData = {
      id: ext.id,
      number: ext.number,
      title: ext.title,
      status: ext.status,
      projectId: ext.projectId,
      projectSlug: ext.projectSlug,
      projectName: ext.projectName,
      isCompleted: ext.isCompleted,
      isCritical: scope ? criticalTaskIds.has(ext.id) : false,
      workspaceId,
      initiativeId: ext.initiativeId,
      initiativeName: ext.initiativeName,
      scopeName: ext.initiativeName,
      sameProject: ext.sameProject,
      onOpen: onOpenTask,
      criticalLabel,
    };

    nodes.push({
      id: ext.id,
      type: "externalTask",
      position: { x, y },
      data: nodeData,
      draggable: true,
      selectable: true,
      connectable: false,
    });
  }

  // 8. Build @xyflow edges
  const CRITICAL_EDGE_COLOR = "#f59e0b";
  const NORMAL_EDGE_COLOR = "var(--muted-foreground, #71717a)";

  const edges: Edge[] = finalEdgesRaw.map((edge) => {
    const isCritical = criticalEdgeKeys.has(edgeKey(edge.source, edge.target));
    const strokeColor = isCritical ? CRITICAL_EDGE_COLOR : NORMAL_EDGE_COLOR;

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      animated: isCritical,
      style: {
        stroke: strokeColor,
        strokeWidth: isCritical ? 2.5 : 1.5,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: strokeColor,
        width: 14,
        height: 14,
      },
    };
  });

  const totalProjectTasks = scope
    ? tasks.filter((t) => scope.taskIds.has(t.id)).length
    : tasks.length;

  return {
    nodes,
    edges,
    critical:
      criticalResult.kind === "path"
        ? {
            kind: "path",
            taskIds: criticalResult.taskIds,
            edgeKeys: criticalResult.edgeKeys,
          }
        : {
            kind: "cycle",
            taskIds: criticalResult.taskIds,
            edgeKeys: [],
          },
    hasCycle,
    cycleTaskNames,
    totalProjectTasks,
    filteredProjectTasks: candidateProjectTasks.length,
    visibleProjectTasks: displayedProjectTasks.length,
    hasVisibleNodes: nodes.length > 0,
  };
}
