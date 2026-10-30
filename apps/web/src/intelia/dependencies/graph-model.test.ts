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
  GraphColumn,
  ProjectRelation,
  ProjectRelationExternalTask,
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
});
