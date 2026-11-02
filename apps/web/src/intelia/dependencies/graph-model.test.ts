import { describe, expect, it, vi } from "vite-plus/test";
import type Task from "@/types/task";
import {
  buildGraphModel,
  checkIsBlocked,
  isTaskCancelled,
  isTaskDone,
  isTaskFinal,
} from "./graph-model";
import type {
  ExternalNodeData,
  GraphColumn,
  ProjectRelation,
  ProjectRelationExternalTask,
  TaskNodeData,
} from "./types";

function createTask(
  partial: Partial<Task> & { id: string; title: string },
): Task {
  return {
    number: 1,
    description: null,
    status: "todo",
    priority: "medium",
    startDate: null,
    dueDate: null,
    position: 0,
    createdAt: new Date().toISOString(),
    userId: null,
    assigneeId: null,
    assigneeName: "Alex",
    projectId: "proj-1",
    ...partial,
  };
}

const mockColumns: GraphColumn[] = [
  { id: "col-todo", slug: "todo", name: "To Do", isFinal: false },
  {
    id: "col-in-progress",
    slug: "in-progress",
    name: "In Progress",
    isFinal: false,
  },
  { id: "col-blocked", slug: "blocked", name: "Blocked", isFinal: false },
  { id: "col-done", slug: "done", name: "Done", isFinal: true },
  { id: "col-cancelled", slug: "cancelled", name: "Cancelled", isFinal: true },
  {
    id: "col-canceled",
    slug: "canceled",
    name: "Canceled (alt)",
    isFinal: true,
  },
];

describe("graph-model rules", () => {
  describe("cancelled vs done classification", () => {
    const columnsBySlug = new Map(mockColumns.map((c) => [c.slug, c]));

    it("identifies final, done, and cancelled columns correctly by status slug", () => {
      const todoTask = createTask({
        id: "t1",
        title: "Todo",
        status: "todo",
      });
      const doneTask = createTask({
        id: "t2",
        title: "Done",
        status: "done",
      });
      const cancelledTask = createTask({
        id: "t3",
        title: "Cancelled",
        status: "cancelled",
      });
      const canceledAltTask = createTask({
        id: "t4",
        title: "Canceled Alt",
        status: "canceled",
      });

      expect(isTaskFinal(todoTask, columnsBySlug)).toBe(false);
      expect(isTaskDone(todoTask, columnsBySlug)).toBe(false);
      expect(isTaskCancelled(todoTask, columnsBySlug)).toBe(false);

      expect(isTaskFinal(doneTask, columnsBySlug)).toBe(true);
      expect(isTaskDone(doneTask, columnsBySlug)).toBe(true);
      expect(isTaskCancelled(doneTask, columnsBySlug)).toBe(false);

      expect(isTaskFinal(cancelledTask, columnsBySlug)).toBe(true);
      expect(isTaskDone(cancelledTask, columnsBySlug)).toBe(false);
      expect(isTaskCancelled(cancelledTask, columnsBySlug)).toBe(true);

      expect(isTaskFinal(canceledAltTask, columnsBySlug)).toBe(true);
      expect(isTaskDone(canceledAltTask, columnsBySlug)).toBe(false);
      expect(isTaskCancelled(canceledAltTask, columnsBySlug)).toBe(true);
    });
  });

  describe("blocked detection", () => {
    const columnsBySlug = new Map(mockColumns.map((c) => [c.slug, c]));

    it("marks blocked if column slug is blocked regardless of relations", () => {
      const blockedTask = createTask({
        id: "t-blocked",
        title: "Blocked Task",
        status: "blocked",
      });
      const allTasksById = new Map([[blockedTask.id, blockedTask]]);

      expect(
        checkIsBlocked(blockedTask, columnsBySlug, [], allTasksById, new Map()),
      ).toBe(true);
    });

    it("marks blocked if incoming blocks relation has unfinished source in project", () => {
      const sourceUnfinished = createTask({
        id: "src",
        title: "Source",
        status: "in-progress",
      });
      const target = createTask({
        id: "tgt",
        title: "Target",
        status: "todo",
      });
      const allTasksById = new Map([
        [sourceUnfinished.id, sourceUnfinished],
        [target.id, target],
      ]);
      const incoming: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "src",
          targetTaskId: "tgt",
          relationType: "blocks",
        },
      ];

      expect(
        checkIsBlocked(
          target,
          columnsBySlug,
          incoming,
          allTasksById,
          new Map(),
        ),
      ).toBe(true);
    });

    it("does not mark blocked if source in project is finished", () => {
      const sourceFinished = createTask({
        id: "src",
        title: "Source",
        status: "done",
      });
      const target = createTask({
        id: "tgt",
        title: "Target",
        status: "todo",
      });
      const allTasksById = new Map([
        [sourceFinished.id, sourceFinished],
        [target.id, target],
      ]);
      const incoming: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "src",
          targetTaskId: "tgt",
          relationType: "blocks",
        },
      ];

      expect(
        checkIsBlocked(
          target,
          columnsBySlug,
          incoming,
          allTasksById,
          new Map(),
        ),
      ).toBe(false);
    });

    it("never marks a finished task as blocked even with an unfinished blocker", () => {
      const sourceUnfinished = createTask({
        id: "src",
        title: "Source",
        status: "in-progress",
      });
      const finishedTarget = createTask({
        id: "done-tgt",
        title: "Finished Target",
        status: "done",
      });
      const allTasksById = new Map([
        [sourceUnfinished.id, sourceUnfinished],
        [finishedTarget.id, finishedTarget],
      ]);
      const incoming: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "src",
          targetTaskId: "done-tgt",
          relationType: "blocks",
        },
      ];

      expect(
        checkIsBlocked(
          finishedTarget,
          columnsBySlug,
          incoming,
          allTasksById,
          new Map(),
        ),
      ).toBe(false);
    });

    it("marks blocked when blocker is hidden by filter but unfinished", () => {
      // Blocker is in project tasks, but will be excluded from filteredTaskIds
      const hiddenBlocker = createTask({
        id: "hidden-blocker",
        title: "Hidden blocker",
        status: "todo",
      });
      const visibleTarget = createTask({
        id: "visible-tgt",
        title: "Visible target",
        status: "todo",
      });
      const relations: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "hidden-blocker",
          targetTaskId: "visible-tgt",
          relationType: "blocks",
        },
      ];

      const model = buildGraphModel({
        tasks: [hiddenBlocker, visibleTarget],
        columns: mockColumns,
        filteredTaskIds: new Set(["visible-tgt"]),
        relations,
        externalTasks: [],
        showLoose: true,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
      });

      const targetNode = model.nodes.find((n) => n.id === "visible-tgt");
      expect(targetNode).toBeDefined();
      expect(targetNode?.data.isBlocked).toBe(true);
    });

    it("marks blocked when blocker is an external unfinished task", () => {
      const visibleTarget = createTask({
        id: "target",
        title: "Target",
        status: "todo",
      });
      const extBlocker: ProjectRelationExternalTask = {
        id: "ext-1",
        number: 42,
        title: "Ext Blocker",
        status: "in-progress",
        isCompleted: false,
        projectId: "other-proj",
        projectSlug: "OTHER",
        projectName: "Other Project",
      };
      const relations: ProjectRelation[] = [
        {
          id: "r-ext",
          sourceTaskId: "ext-1",
          targetTaskId: "target",
          relationType: "blocks",
        },
      ];

      const model = buildGraphModel({
        tasks: [visibleTarget],
        columns: mockColumns,
        filteredTaskIds: new Set(["target"]),
        relations,
        externalTasks: [extBlocker],
        showLoose: false,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
      });

      const targetNode = model.nodes.find((n) => n.id === "target");
      expect(targetNode?.data.isBlocked).toBe(true);
    });

    it("does not mark blocked when blocker is an external completed task", () => {
      const visibleTarget = createTask({
        id: "target",
        title: "Target",
        status: "todo",
      });
      const extBlocker: ProjectRelationExternalTask = {
        id: "ext-1",
        number: 42,
        title: "Ext Blocker",
        status: "done",
        isCompleted: true,
        projectId: "other-proj",
        projectSlug: "OTHER",
        projectName: "Other Project",
      };
      const relations: ProjectRelation[] = [
        {
          id: "r-ext",
          sourceTaskId: "ext-1",
          targetTaskId: "target",
          relationType: "blocks",
        },
      ];

      const model = buildGraphModel({
        tasks: [visibleTarget],
        columns: mockColumns,
        filteredTaskIds: new Set(["target"]),
        relations,
        externalTasks: [extBlocker],
        showLoose: false,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
      });

      const targetNode = model.nodes.find((n) => n.id === "target");
      expect(targetNode?.data.isBlocked).toBe(false);
    });
  });

  describe("loose task visibility", () => {
    it("hides loose tasks by default (showLoose = false) and shows them when showLoose = true", () => {
      const connected1 = createTask({ id: "c1", title: "C1", status: "todo" });
      const connected2 = createTask({ id: "c2", title: "C2", status: "todo" });
      const looseTask = createTask({
        id: "loose",
        title: "Loose",
        status: "todo",
      });

      const relations: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "c1",
          targetTaskId: "c2",
          relationType: "blocks",
        },
      ];

      const hiddenModel = buildGraphModel({
        tasks: [connected1, connected2, looseTask],
        columns: mockColumns,
        filteredTaskIds: new Set(["c1", "c2", "loose"]),
        relations,
        externalTasks: [],
        showLoose: false,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
      });

      expect(hiddenModel.nodes.map((n) => n.id)).toEqual(["c1", "c2"]);

      const shownModel = buildGraphModel({
        tasks: [connected1, connected2, looseTask],
        columns: mockColumns,
        filteredTaskIds: new Set(["c1", "c2", "loose"]),
        relations,
        externalTasks: [],
        showLoose: true,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
      });

      expect(shownModel.nodes.map((n) => n.id)).toContain("loose");
      expect(shownModel.nodes).toHaveLength(3);
    });
  });

  describe("edge dropping and non-blocks relations", () => {
    it("drops edges when one end is hidden by filter", () => {
      const t1 = createTask({ id: "t1", title: "T1", status: "todo" });
      const t2 = createTask({ id: "t2", title: "T2", status: "todo" });

      const relations: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "t1",
          targetTaskId: "t2",
          relationType: "blocks",
        },
      ];

      const model = buildGraphModel({
        tasks: [t1, t2],
        columns: mockColumns,
        filteredTaskIds: new Set(["t1"]),
        relations,
        externalTasks: [],
        showLoose: true,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
      });

      expect(model.edges).toHaveLength(0);
      expect(model.nodes.map((n) => n.id)).toEqual(["t1"]);
    });

    it("does not draw subtask or related relations as edges", () => {
      const t1 = createTask({ id: "t1", title: "T1", status: "todo" });
      const t2 = createTask({ id: "t2", title: "T2", status: "todo" });

      const relations: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "t1",
          targetTaskId: "t2",
          relationType: "subtask",
        },
        {
          id: "r2",
          sourceTaskId: "t1",
          targetTaskId: "t2",
          relationType: "related",
        },
      ];

      const model = buildGraphModel({
        tasks: [t1, t2],
        columns: mockColumns,
        filteredTaskIds: new Set(["t1", "t2"]),
        relations,
        externalTasks: [],
        showLoose: true,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
      });

      expect(model.edges).toHaveLength(0);
    });

    it("draws blocks edges with layout coordinates and arrow markers", () => {
      const t1 = createTask({ id: "t1", title: "T1", status: "todo" });
      const t2 = createTask({ id: "t2", title: "T2", status: "todo" });

      const relations: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "t1",
          targetTaskId: "t2",
          relationType: "blocks",
        },
      ];

      const model = buildGraphModel({
        tasks: [t1, t2],
        columns: mockColumns,
        filteredTaskIds: new Set(["t1", "t2"]),
        relations,
        externalTasks: [],
        showLoose: false,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
      });

      expect(model.edges).toHaveLength(1);
      expect(model.edges[0].source).toBe("t1");
      expect(model.edges[0].target).toBe("t2");
      const node1 = model.nodes.find((n) => n.id === "t1");
      const node2 = model.nodes.find((n) => n.id === "t2");
      expect(node1?.position.x).toBeLessThan(node2?.position.x ?? 0);
    });
  });

  describe("cycle detection with external tasks", () => {
    it("detects cycle involving external task: A (project) -> X (external) -> B (project) -> A", () => {
      const taskA = createTask({
        id: "task-a",
        number: 1,
        title: "Task A",
        status: "todo",
      });
      const taskB = createTask({
        id: "task-b",
        number: 2,
        title: "Task B",
        status: "todo",
      });

      const externalX: ProjectRelationExternalTask = {
        id: "task-x",
        number: 99,
        title: "External X",
        status: "in-progress",
        isCompleted: false,
        projectId: "proj-ext",
        projectSlug: "EXT",
        projectName: "External Project",
      };

      const relations: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "task-a",
          targetTaskId: "task-x",
          relationType: "blocks",
        },
        {
          id: "r2",
          sourceTaskId: "task-x",
          targetTaskId: "task-b",
          relationType: "blocks",
        },
        {
          id: "r3",
          sourceTaskId: "task-b",
          targetTaskId: "task-a",
          relationType: "blocks",
        },
      ];

      const model = buildGraphModel({
        tasks: [taskA, taskB],
        columns: mockColumns,
        filteredTaskIds: new Set(["task-a", "task-b"]),
        relations,
        externalTasks: [externalX],
        showLoose: false,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
      });

      expect(model.hasCycle).toBe(true);
      expect(model.critical.kind).toBe("cycle");
      expect(model.critical.edgeKeys).toHaveLength(0);

      // Names should include external task formatted as ${projectSlug}-${number} title
      expect(model.cycleTaskNames).toContain("EXT-99 External X");
      expect(model.cycleTaskNames).toContain("DEMO-1 Task A");
      expect(model.cycleTaskNames).toContain("DEMO-2 Task B");

      // No critical nodes or edges
      const criticalNodes = model.nodes.filter((n) => {
        const data = n.data;
        return Boolean(
          data &&
          typeof data === "object" &&
          "isCritical" in data &&
          data.isCritical,
        );
      });
      expect(criticalNodes).toHaveLength(0);

      const criticalEdges = model.edges.filter((e) => e.animated);
      expect(criticalEdges).toHaveLength(0);
    });

    it("detects cycle with only project tasks", () => {
      const taskA = createTask({
        id: "task-a",
        number: 1,
        title: "Task A",
        status: "todo",
      });
      const taskB = createTask({
        id: "task-b",
        number: 2,
        title: "Task B",
        status: "todo",
      });

      const relations: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "task-a",
          targetTaskId: "task-b",
          relationType: "blocks",
        },
        {
          id: "r2",
          sourceTaskId: "task-b",
          targetTaskId: "task-a",
          relationType: "blocks",
        },
      ];

      const model = buildGraphModel({
        tasks: [taskA, taskB],
        columns: mockColumns,
        filteredTaskIds: new Set(["task-a", "task-b"]),
        relations,
        externalTasks: [],
        showLoose: false,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
      });

      expect(model.hasCycle).toBe(true);
      expect(model.cycleTaskNames).toEqual(["DEMO-1 Task A", "DEMO-2 Task B"]);
      expect(model.critical.kind).toBe("cycle");
      expect(model.critical.edgeKeys).toHaveLength(0);
    });
  });

  describe("filteredProjectTasks count", () => {
    it("reflects tasks matching filter before loose task filtering", () => {
      const task1 = createTask({ id: "t1", title: "T1", status: "todo" });
      const task2 = createTask({ id: "t2", title: "T2", status: "todo" });
      const task3 = createTask({ id: "t3", title: "T3", status: "todo" });

      // No relations: all tasks are loose
      const modelHidden = buildGraphModel({
        tasks: [task1, task2, task3],
        columns: mockColumns,
        filteredTaskIds: new Set(["t1", "t2"]),
        relations: [],
        externalTasks: [],
        showLoose: false,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
      });

      expect(modelHidden.totalProjectTasks).toBe(3);
      expect(modelHidden.filteredProjectTasks).toBe(2);
      expect(modelHidden.visibleProjectTasks).toBe(0);
      expect(modelHidden.hasVisibleNodes).toBe(false);

      const modelShown = buildGraphModel({
        tasks: [task1, task2, task3],
        columns: mockColumns,
        filteredTaskIds: new Set(["t1", "t2"]),
        relations: [],
        externalTasks: [],
        showLoose: true,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
      });

      expect(modelShown.totalProjectTasks).toBe(3);
      expect(modelShown.filteredProjectTasks).toBe(2);
      expect(modelShown.visibleProjectTasks).toBe(2);
      expect(modelShown.hasVisibleNodes).toBe(true);
    });
  });

  describe("initiative scope", () => {
    it("scopes project tasks to initiative members only", () => {
      const task1 = createTask({ id: "t1", title: "Task 1", status: "todo" });
      const task2 = createTask({ id: "t2", title: "Task 2", status: "todo" });
      const task3 = createTask({ id: "t3", title: "Task 3", status: "todo" });

      const relations: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "t1",
          targetTaskId: "t2",
          relationType: "blocks",
        },
      ];

      const model = buildGraphModel({
        tasks: [task1, task2, task3],
        columns: mockColumns,
        filteredTaskIds: new Set(["t1", "t2", "t3"]),
        relations,
        externalTasks: [],
        showLoose: false,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
        scope: {
          taskIds: new Set(["t1", "t2"]),
        },
      });

      expect(model.totalProjectTasks).toBe(2);
      expect(model.filteredProjectTasks).toBe(2);
      expect(model.visibleProjectTasks).toBe(2);
      expect(model.nodes.map((n) => n.id)).toEqual(["t1", "t2"]);
      expect(model.nodes.every((n) => n.type === "projectTask")).toBe(true);
    });

    it("draws tasks of other initiatives in the same project as frontier nodes with initiative name", () => {
      const onOpenTask = vi.fn();
      const task1 = createTask({
        id: "t1",
        number: 1,
        title: "Task 1",
        status: "todo",
      });
      const task2 = createTask({
        id: "t2",
        number: 2,
        title: "Task 2",
        status: "todo",
      });

      const relations: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "t1",
          targetTaskId: "t2",
          relationType: "blocks",
        },
      ];

      const model = buildGraphModel({
        tasks: [task1, task2],
        columns: mockColumns,
        filteredTaskIds: new Set(["t1", "t2"]),
        relations,
        externalTasks: [],
        showLoose: false,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask,
        scope: {
          taskIds: new Set(["t1"]),
          frontier: [
            {
              id: "t2",
              initiativeId: "init-other",
              initiativeName: "Motor de flujo",
            },
          ],
        },
      });

      expect(model.nodes).toHaveLength(2);
      const node1 = model.nodes.find((n) => n.id === "t1");
      const node2 = model.nodes.find((n) => n.id === "t2");

      expect(node1?.type).toBe("projectTask");
      expect(node2?.type).toBe("externalTask");
      const data2 = node2?.data as unknown as ExternalNodeData;
      expect(data2.sameProject).toBe(true);
      expect(data2.scopeName).toBe("Motor de flujo");
      expect(data2.initiativeName).toBe("Motor de flujo");

      // Clicking same-project external triggers onOpenTask
      data2.onOpen?.("t2");
      expect(onOpenTask).toHaveBeenCalledWith("t2");
    });

    it("hides cancelled tasks by default when initiative scope is active", () => {
      const task1 = createTask({ id: "t1", title: "Task 1", status: "todo" });
      const task2 = createTask({
        id: "t2",
        title: "Task 2 (cancelled)",
        status: "cancelled",
      });

      const relations: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "t1",
          targetTaskId: "t2",
          relationType: "blocks",
        },
        {
          id: "r2",
          sourceTaskId: "t3",
          targetTaskId: "t1",
          relationType: "blocks",
        },
      ];

      // Scoped without showCancelled: defaults to false (hidden)
      const modelHidden = buildGraphModel({
        tasks: [task1, task2],
        columns: mockColumns,
        filteredTaskIds: new Set(["t1", "t2"]),
        relations,
        externalTasks: [],
        showLoose: true,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
        scope: {
          taskIds: new Set(["t1", "t2"]),
          frontier: [{ id: "t3", status: "cancelled", title: "Ext Cancelled" }],
        },
      });

      expect(modelHidden.nodes.map((n) => n.id)).toEqual(["t1"]);
      expect(modelHidden.edges).toHaveLength(0);

      // Scoped with showCancelled: true
      const modelShown = buildGraphModel({
        tasks: [task1, task2],
        columns: mockColumns,
        filteredTaskIds: new Set(["t1", "t2"]),
        relations,
        externalTasks: [],
        showLoose: true,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
        scope: {
          taskIds: new Set(["t1", "t2"]),
          frontier: [{ id: "t3", status: "cancelled", title: "Ext Cancelled" }],
        },
        showCancelled: true,
      });

      expect(modelShown.nodes.map((n) => n.id).sort()).toEqual(
        ["t1", "t2", "t3"].sort(),
      );
      expect(modelShown.edges).toHaveLength(2);
    });

    it("computes longest pending chain including external/frontier nodes and sets criticalLabel", () => {
      const task1 = createTask({ id: "t1", title: "Task 1", status: "todo" });
      const task2 = createTask({ id: "t2", title: "Task 2", status: "todo" });
      const extTask = {
        id: "ext-1",
        number: 99,
        title: "External blocker",
        status: "in-progress",
        projectId: "proj-ext",
        projectSlug: "EXT",
        projectName: "Project External",
        isCompleted: false,
      };

      const relations: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "ext-1",
          targetTaskId: "t1",
          relationType: "blocks",
        },
        {
          id: "r2",
          sourceTaskId: "t1",
          targetTaskId: "t2",
          relationType: "blocks",
        },
      ];

      const model = buildGraphModel({
        tasks: [task1, task2],
        columns: mockColumns,
        filteredTaskIds: new Set(["t1", "t2"]),
        relations,
        externalTasks: [extTask],
        showLoose: false,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
        scope: {
          taskIds: new Set(["t1", "t2"]),
        },
      });

      expect(model.critical.kind).toBe("path");
      expect(model.critical.taskIds).toEqual(["ext-1", "t1", "t2"]);

      const extNode = model.nodes.find((n) => n.id === "ext-1");
      const t1Node = model.nodes.find((n) => n.id === "t1");
      const t2Node = model.nodes.find((n) => n.id === "t2");
      const extData = extNode?.data as unknown as ExternalNodeData;
      const t1Data = t1Node?.data as unknown as TaskNodeData;
      const t2Data = t2Node?.data as unknown as TaskNodeData;

      expect(extData.isCritical).toBe(true);
      expect(t1Data.isCritical).toBe(true);
      expect(t2Data.isCritical).toBe(true);
      expect(t1Data.criticalLabel).toBe("Cadena pendiente más larga");
      expect(extData.criticalLabel).toBe("Cadena pendiente más larga");
    });

    it("keeps existing behaviour completely unchanged when scope is not provided", () => {
      const task1 = createTask({ id: "t1", title: "Task 1", status: "todo" });
      const task2 = createTask({
        id: "t2",
        title: "Task 2 (cancelled)",
        status: "cancelled",
      });

      const relations: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "t1",
          targetTaskId: "t2",
          relationType: "blocks",
        },
      ];

      const model = buildGraphModel({
        tasks: [task1, task2],
        columns: mockColumns,
        filteredTaskIds: new Set(["t1", "t2"]),
        relations,
        externalTasks: [],
        showLoose: false,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
      });

      // Unscoped without showCancelled defaults to showCancelled = true
      expect(model.nodes.map((n) => n.id)).toEqual(["t1", "t2"]);
      const t1Node = model.nodes.find((n) => n.id === "t1");
      const t1Data = t1Node?.data as unknown as TaskNodeData;
      expect(t1Data.criticalLabel).toBeUndefined();
    });

    it("does not include external tasks in critical path when scope is not provided (unscoped regression)", () => {
      const task1 = createTask({ id: "t1", title: "Task 1", status: "todo" });
      const task2 = createTask({ id: "t2", title: "Task 2", status: "todo" });
      const extTask = {
        id: "ext-1",
        number: 99,
        title: "External blocker",
        status: "in-progress",
        projectId: "proj-ext",
        projectSlug: "EXT",
        projectName: "Project External",
        isCompleted: false,
      };

      const relations: ProjectRelation[] = [
        {
          id: "r1",
          sourceTaskId: "ext-1",
          targetTaskId: "t1",
          relationType: "blocks",
        },
        {
          id: "r2",
          sourceTaskId: "t1",
          targetTaskId: "t2",
          relationType: "blocks",
        },
      ];

      const model = buildGraphModel({
        tasks: [task1, task2],
        columns: mockColumns,
        filteredTaskIds: new Set(["t1", "t2"]),
        relations,
        externalTasks: [extTask],
        showLoose: false,
        projectSlug: "DEMO",
        workspaceId: "ws-1",
        onOpenTask: vi.fn(),
      });

      // Without scope: critical path only covers project tasks t1 -> t2, NOT ext-1
      expect(model.critical.kind).toBe("path");
      expect(model.critical.taskIds).toEqual(["t1", "t2"]);
      expect(model.critical.edgeKeys).toEqual(["t1->t2"]);

      const extNode = model.nodes.find((n) => n.id === "ext-1");
      const extData = extNode?.data as unknown as ExternalNodeData;
      expect(extData.isCritical).toBe(false);

      const extEdge = model.edges.find((e) => e.id === "ext-1->t1");
      expect(extEdge?.animated).toBe(false);
    });
  });
});
