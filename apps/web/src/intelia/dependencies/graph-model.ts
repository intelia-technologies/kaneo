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
  if (!col?.isFinal) return false;
  const slug = col.slug.toLowerCase();
  return slug === "cancelled" || slug === "canceled";
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
  externalTasksById: Map<string, ProjectRelationExternalTask>,
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
}: BuildGraphModelOptions): GraphModelResult {
  const columnsBySlug = new Map<string, GraphColumn>();
  for (const col of columns) {
    columnsBySlug.set(col.slug, col);
  }

  const allTasksById = new Map<string, Task>();
  for (const task of tasks) {
    allTasksById.set(task.id, task);
  }

  const externalTasksById = new Map<string, ProjectRelationExternalTask>();
  for (const ext of externalTasks) {
    externalTasksById.set(ext.id, ext);
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

  // 1. Candidate project tasks (pass filter bar)
  const candidateProjectTasks = tasks.filter((task) =>
    filteredTaskIds.has(task.id),
  );
  const candidateProjectTaskIds = new Set(
    candidateProjectTasks.map((task) => task.id),
  );

  // 2. Visible external tasks: must have a blocks relation with a candidate project task
  const visibleExternalTaskIds = new Set<string>();
  for (const relation of relations) {
    if (relation.relationType !== "blocks") continue;
    if (
      externalTasksById.has(relation.sourceTaskId) &&
      candidateProjectTaskIds.has(relation.targetTaskId)
    ) {
      visibleExternalTaskIds.add(relation.sourceTaskId);
    }
    if (
      externalTasksById.has(relation.targetTaskId) &&
      candidateProjectTaskIds.has(relation.sourceTaskId)
    ) {
      visibleExternalTaskIds.add(relation.targetTaskId);
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

  const displayedExternalTasks = externalTasks.filter((ext) =>
    visibleExternalTaskIds.has(ext.id),
  );
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
  // edge; the critical path only runs over project tasks when there is none.
  const cycle = findCycle(
    Array.from(finalNodeIds),
    finalEdgesRaw.map((e) => ({ source: e.source, target: e.target })),
  );

  const criticalResult: CriticalPathResult = cycle
    ? { kind: "cycle", taskIds: cycle }
    : computeCriticalPath(
        displayedProjectTasks.map((task) => ({
          id: task.id,
          priority: task.priority ?? null,
          finished: isTaskFinal(task, columnsBySlug),
        })),
        finalEdgesRaw.filter(
          (e) =>
            displayedProjectTaskIds.has(e.source) &&
            displayedProjectTaskIds.has(e.target),
        ),
      );

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
      const ext = externalTasksById.get(id);
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
      externalTasksById,
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
      isCritical: false,
      workspaceId,
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
    totalProjectTasks: tasks.length,
    filteredProjectTasks: candidateProjectTasks.length,
    visibleProjectTasks: displayedProjectTasks.length,
    hasVisibleNodes: nodes.length > 0,
  };
}
