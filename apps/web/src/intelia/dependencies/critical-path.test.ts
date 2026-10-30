import { describe, expect, it } from "vite-plus/test";
import {
  type BlocksEdge,
  computeCriticalPath,
  edgeKey,
  type PathTask,
} from "./critical-path";

function task(
  id: string,
  priority: string | null = null,
  finished = false,
): PathTask {
  return { id, priority, finished };
}

function edge(source: string, target: string): BlocksEdge {
  return { source, target };
}

describe("edgeKey", () => {
  it("formats source and target as source->target", () => {
    expect(edgeKey("task-1", "task-2")).toBe("task-1->task-2");
  });
});

describe("critical path calculation", () => {
  describe("parallel branches: diamond / fork-join", () => {
    it("chooses the longer branch in a diamond graph with start->end ordering", () => {
      // S -> A -> B -> E (length 4)
      // S -> C -> E      (length 3)
      const tasks: PathTask[] = [
        task("S", "low"),
        task("A", "low"),
        task("B", "low"),
        task("C", "urgent"), // C has high priority, but branch S-A-B-E is longer
        task("E", "low"),
      ];
      const edges: BlocksEdge[] = [
        edge("S", "A"),
        edge("A", "B"),
        edge("B", "E"),
        edge("S", "C"),
        edge("C", "E"),
      ];

      const result = computeCriticalPath(tasks, edges);

      expect(result).toEqual({
        kind: "path",
        taskIds: ["S", "A", "B", "E"],
        edgeKeys: ["S->A", "A->B", "B->E"],
      });
    });
  });

  describe("long chain vs several short parallel chains", () => {
    it("selects the longest chain over multiple shorter parallel chains", () => {
      const tasks: PathTask[] = [
        // Long chain of 5 tasks
        task("T1"),
        task("T2"),
        task("T3"),
        task("T4"),
        task("T5"),
        // Parallel short chains of 2 tasks
        task("P1", "urgent"),
        task("P2", "urgent"),
        task("Q1", "urgent"),
        task("Q2", "urgent"),
        task("R1", "urgent"),
        task("R2", "urgent"),
      ];
      const edges: BlocksEdge[] = [
        edge("T1", "T2"),
        edge("T2", "T3"),
        edge("T3", "T4"),
        edge("T4", "T5"),
        edge("P1", "P2"),
        edge("Q1", "Q2"),
        edge("R1", "R2"),
      ];

      const result = computeCriticalPath(tasks, edges);

      expect(result).toEqual({
        kind: "path",
        taskIds: ["T1", "T2", "T3", "T4", "T5"],
        edgeKeys: ["T1->T2", "T2->T3", "T3->T4", "T4->T5"],
      });
    });
  });

  describe("priority tie-breaker and input order invariance", () => {
    it("breaks equal-length ties in favor of higher total priority sum", () => {
      const tasks: PathTask[] = [
        // Chain A: length 2, sum = 4 (urgent) + 3 (high) = 7
        task("A1", "urgent"),
        task("A2", "high"),
        // Chain B: length 2, sum = 2 (medium) + 1 (low) = 3
        task("B1", "medium"),
        task("B2", "low"),
      ];
      const edges: BlocksEdge[] = [edge("B1", "B2"), edge("A1", "A2")];

      const result = computeCriticalPath(tasks, edges);

      expect(result).toEqual({
        kind: "path",
        taskIds: ["A1", "A2"],
        edgeKeys: ["A1->A2"],
      });
    });

    it("breaks equal-length and equal-priority ties deterministically by lexicographical order", () => {
      const tasks: PathTask[] = [
        // Chain Y: length 2, sum = 3
        task("Y1", "high"),
        task("Y2", "no-priority"),
        // Chain X: length 2, sum = 3
        task("X1", "high"),
        task("X2", null),
      ];
      // Y passed before X in input
      const edges: BlocksEdge[] = [edge("Y1", "Y2"), edge("X1", "X2")];

      const result = computeCriticalPath(tasks, edges);

      // X1 < Y1 lexicographically, so X chain wins despite Y being first in array
      expect(result).toEqual({
        kind: "path",
        taskIds: ["X1", "X2"],
        edgeKeys: ["X1->X2"],
      });
    });

    it("produces identical results regardless of tasks and edges input order (shuffling)", () => {
      const baseTasks: PathTask[] = [
        task("T1", "high"),
        task("T2", "medium"),
        task("T3", "urgent"),
        task("P1", "urgent"),
        task("P2", "urgent"),
      ];
      const baseEdges: BlocksEdge[] = [
        edge("T1", "T2"),
        edge("T2", "T3"),
        edge("P1", "P2"),
      ];

      const referenceResult = computeCriticalPath(baseTasks, baseEdges);

      // Test multiple permutations
      const reversedTasks = [...baseTasks].reverse();
      const reversedEdges = [...baseEdges].reverse();
      expect(computeCriticalPath(reversedTasks, reversedEdges)).toEqual(
        referenceResult,
      );

      const shuffledTasks = [
        baseTasks[2],
        baseTasks[0],
        baseTasks[4],
        baseTasks[1],
        baseTasks[3],
      ];
      const shuffledEdges = [baseEdges[1], baseEdges[2], baseEdges[0]];
      expect(computeCriticalPath(shuffledTasks, shuffledEdges)).toEqual(
        referenceResult,
      );
    });

    it("treats inherited Object prototype property names (e.g. constructor) as rank 0 in both input orders", () => {
      const taskA = task("A", "constructor");
      const taskB = task("B", "urgent");

      const order1 = computeCriticalPath([taskA, taskB], []);
      const order2 = computeCriticalPath([taskB, taskA], []);

      expect(order1).toEqual({
        kind: "path",
        taskIds: ["B"],
        edgeKeys: [],
      });
      expect(order2).toEqual({
        kind: "path",
        taskIds: ["B"],
        edgeKeys: [],
      });
    });
  });

  describe("cycle detection", () => {
    it("detects a 3-task cycle and returns those 3 IDs in cycle order", () => {
      const tasks: PathTask[] = [
        task("t1"),
        task("t2"),
        task("t3"),
        task("other", "urgent"),
      ];
      const edges: BlocksEdge[] = [
        edge("t1", "t2"),
        edge("t2", "t3"),
        edge("t3", "t1"),
        edge("other", "t1"),
      ];

      const result = computeCriticalPath(tasks, edges);

      expect(result).toEqual({
        kind: "cycle",
        taskIds: ["t1", "t2", "t3"],
      });
    });

    it("detects a self-loop as a cycle", () => {
      const tasks: PathTask[] = [task("loop-task"), task("normal-task")];
      const edges: BlocksEdge[] = [
        edge("loop-task", "loop-task"),
        edge("normal-task", "loop-task"),
      ];

      const result = computeCriticalPath(tasks, edges);

      expect(result).toEqual({
        kind: "cycle",
        taskIds: ["loop-task"],
      });
    });

    it("still reports a cycle that only contains finished tasks", () => {
      const tasks: PathTask[] = [
        // Finished tasks forming a cycle
        task("f1", null, true),
        task("f2", null, true),
        task("f3", null, true),
        // Unfinished tasks forming a valid path
        task("u1", "urgent", false),
        task("u2", "urgent", false),
      ];
      const edges: BlocksEdge[] = [
        edge("f1", "f2"),
        edge("f2", "f3"),
        edge("f3", "f1"),
        edge("u1", "u2"),
      ];

      const result = computeCriticalPath(tasks, edges);

      expect(result).toEqual({
        kind: "cycle",
        taskIds: ["f1", "f2", "f3"],
      });
    });
  });

  describe("finished tasks exclusion (done and cancelled)", () => {
    it("splits a long chain when a middle task is finished", () => {
      // Chain: A -> B -> C (finished) -> D -> E
      // Becomes [A, B] and [D, E]
      const tasks: PathTask[] = [
        task("A", "low", false),
        task("B", "low", false),
        task("C", "urgent", true), // Middle task finished
        task("D", "urgent", false),
        task("E", "urgent", false),
      ];
      const edges: BlocksEdge[] = [
        edge("A", "B"),
        edge("B", "C"),
        edge("C", "D"),
        edge("D", "E"),
      ];

      const result = computeCriticalPath(tasks, edges);

      // Both [A, B] and [D, E] have length 2; [D, E] has higher priority sum (4+4=8 vs 1+1=2)
      expect(result).toEqual({
        kind: "path",
        taskIds: ["D", "E"],
        edgeKeys: ["D->E"],
      });
    });

    it("handles multiple finished tasks throughout the chain", () => {
      const tasks: PathTask[] = [
        task("t1", "medium", true), // Done
        task("t2", "medium", false),
        task("t3", "medium", false),
        task("t4", "medium", true), // Cancelled
      ];
      const edges: BlocksEdge[] = [
        edge("t1", "t2"),
        edge("t2", "t3"),
        edge("t3", "t4"),
      ];

      const result = computeCriticalPath(tasks, edges);

      expect(result).toEqual({
        kind: "path",
        taskIds: ["t2", "t3"],
        edgeKeys: ["t2->t3"],
      });
    });
  });

  describe("edge cases", () => {
    it("ignores edges with unknown task IDs", () => {
      const tasks: PathTask[] = [task("real-1", "low"), task("real-2", "low")];
      const edges: BlocksEdge[] = [
        edge("real-1", "ghost-target"),
        edge("ghost-source", "real-2"),
        edge("ghost-source", "ghost-target"),
        edge("real-1", "real-2"),
      ];

      const result = computeCriticalPath(tasks, edges);

      expect(result).toEqual({
        kind: "path",
        taskIds: ["real-1", "real-2"],
        edgeKeys: ["real-1->real-2"],
      });
    });

    it("returns an empty path when there are no unfinished tasks", () => {
      const tasks: PathTask[] = [
        task("done-1", "urgent", true),
        task("done-2", "high", true),
      ];
      const edges: BlocksEdge[] = [edge("done-1", "done-2")];

      const result = computeCriticalPath(tasks, edges);

      expect(result).toEqual({
        kind: "path",
        taskIds: [],
        edgeKeys: [],
      });
    });

    it("returns an empty path when tasks array is empty", () => {
      const result = computeCriticalPath([], []);

      expect(result).toEqual({
        kind: "path",
        taskIds: [],
        edgeKeys: [],
      });
    });

    it("returns a chain of 1 for a single unfinished task with no edges", () => {
      const tasks: PathTask[] = [task("single", "medium", false)];
      const edges: BlocksEdge[] = [];

      const result = computeCriticalPath(tasks, edges);

      expect(result).toEqual({
        kind: "path",
        taskIds: ["single"],
        edgeKeys: [],
      });
    });

    it("handles duplicate edges cleanly without cycle false-positives or duplicate edge keys", () => {
      const tasks: PathTask[] = [task("N1", "low"), task("N2", "low")];
      const edges: BlocksEdge[] = [edge("N1", "N2"), edge("N1", "N2")];

      const result = computeCriticalPath(tasks, edges);

      expect(result).toEqual({
        kind: "path",
        taskIds: ["N1", "N2"],
        edgeKeys: ["N1->N2"],
      });
    });
  });
});
