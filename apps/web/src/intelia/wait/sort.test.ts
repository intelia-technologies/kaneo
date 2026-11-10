import { describe, expect, it } from "vite-plus/test";
import { sortTasks } from "@/lib/sort-tasks";
import type Task from "@/types/task";
import type { BlockersSummary } from "@/types/task/blockers-summary";
import { summaryByReason, waitingOnPerson } from "./sample.test-data";

function task(id: string, status: string, summary?: BlockersSummary): Task {
  return { id, status, blockersSummary: summary } as Task;
}

const ids = (tasks: Task[]) => tasks.map((item) => item.id);

describe("sortTasks by wait (design 55 §3.2)", () => {
  const tasks = [
    task("person", "to-do", summaryByReason.person),
    task("doing", "in-progress", summaryByReason.ready),
    task("ready", "to-do", summaryByReason.ready),
    task("missing", "to-do"),
    task("cancelled", "to-do", summaryByReason.cancelled),
    task("in_progress", "to-do", summaryByReason.in_progress),
  ];

  it("goes from ready to the worst reason, without a wait last", () => {
    expect(ids(sortTasks(tasks, { field: "wait", direction: "asc" }))).toEqual([
      "ready",
      "in_progress",
      "person",
      "cancelled",
      "doing",
      "missing",
    ]);
  });

  it("puts the worst reason first descending, still without a wait last", () => {
    expect(ids(sortTasks(tasks, { field: "wait", direction: "desc" }))).toEqual(
      ["cancelled", "person", "in_progress", "ready", "doing", "missing"],
    );
  });

  it("breaks a tie by the number of pending blockers", () => {
    const more = { ...summaryByReason.in_progress, pendingCount: 3 };
    expect(
      ids(
        sortTasks(
          [
            task("three", "to-do", more),
            task("one", "to-do", summaryByReason.in_progress),
          ],
          { field: "wait", direction: "asc" },
        ),
      ),
    ).toEqual(["one", "three"]);
  });
});

describe("sortTasks by root (design 55 §3.2)", () => {
  const rootedAt = (ticket: string): BlockersSummary => ({
    ...waitingOnPerson,
    root: {
      kind: "task",
      task: { ...waitingOnPerson.root!.task!, ticket },
      depth: 1,
    },
  });
  const tasks = [
    task("cycle", "to-do", summaryByReason.blocked),
    task("kf10", "to-do", rootedAt("KF-10")),
    task("ready", "to-do", summaryByReason.ready),
    task("external", "to-do", summaryByReason.external),
    task("kf9", "to-do", rootedAt("KF-9")),
    task("kf9b", "to-do", rootedAt("KF-9")),
  ];

  it("groups tasks by root ticket in numeric order, then rootless kinds, then none", () => {
    expect(ids(sortTasks(tasks, { field: "root", direction: "asc" }))).toEqual([
      "kf9",
      "kf9b",
      "kf10",
      "external",
      "cycle",
      "ready",
    ]);
  });

  it("reverses descending but keeps tasks without a root last", () => {
    expect(ids(sortTasks(tasks, { field: "root", direction: "desc" }))).toEqual(
      ["cycle", "external", "kf10", "kf9", "kf9b", "ready"],
    );
  });
});
