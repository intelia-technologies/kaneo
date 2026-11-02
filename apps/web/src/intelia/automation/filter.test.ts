import { describe, expect, it } from "vite-plus/test";
import type { BoardFilters } from "@/hooks/use-task-filters";
import { countActiveFilters } from "@/lib/task-filters/count-active-filters";
import {
  type TaskFilterContext,
  taskMatchesFilters,
} from "@/lib/task-filters/task-matches-filters";
import type Task from "@/types/task";

const noFilters: BoardFilters = {
  status: null,
  priority: null,
  assignee: null,
  dueDate: null,
  labels: null,
  customFields: null,
};

const context: TaskFilterContext = {
  weekStartsOn: 1,
  today: new Date(2026, 9, 14),
  getCustomFieldValues: () => [],
  automation: new Map([
    ["manual-task", { level: "manual" }],
    ["arranque-task", { level: "arranque" }],
    ["completa-task", { level: "completa" }],
  ]),
};

const tasks = [
  "manual-task",
  "arranque-task",
  "completa-task",
  "bare-task",
].map((id) => ({ id, title: id, status: "todo" }) as Task);

function visible(filters: Partial<BoardFilters>) {
  return tasks
    .filter((task) =>
      taskMatchesFilters(task, { ...noFilters, ...filters }, context),
    )
    .map((task) => task.id);
}

describe("automation filter", () => {
  it("shows every task without a selection", () => {
    expect(visible({})).toEqual([
      "manual-task",
      "arranque-task",
      "completa-task",
      "bare-task",
    ]);
  });

  it("leaves only the tasks of the selected level", () => {
    expect(visible({ automation: ["completa"] })).toEqual(["completa-task"]);
  });

  it("skips the filter while the project map is not loaded", () => {
    const unloaded = { ...context, automation: undefined };
    expect(
      tasks.filter((task) =>
        taskMatchesFilters(
          task,
          { ...noFilters, automation: ["completa"] },
          unloaded,
        ),
      ),
    ).toEqual(tasks);
  });

  it("matches any of several selected levels", () => {
    expect(visible({ automation: ["manual", "arranque"] })).toEqual([
      "manual-task",
      "arranque-task",
    ]);
  });

  it("treats tasks without a level as `none`", () => {
    expect(visible({ automation: ["none"] })).toEqual(["bare-task"]);
    expect(visible({ automation: ["manual"] })).not.toContain("bare-task");
  });

  it("negated, keeps every other level and the tasks without one", () => {
    expect(
      visible({ automation: ["completa"], negated: ["automation"] }),
    ).toEqual(["manual-task", "arranque-task", "bare-task"]);
  });

  it("negated `none` keeps only the tasks that have a level", () => {
    expect(visible({ automation: ["none"], negated: ["automation"] })).toEqual([
      "manual-task",
      "arranque-task",
      "completa-task",
    ]);
  });

  it("combines with the other filters", () => {
    expect(
      visible({ automation: ["manual", "completa"], status: ["done"] }),
    ).toEqual([]);
    expect(
      visible({ automation: ["manual", "completa"], status: ["todo"] }),
    ).toEqual(["manual-task", "completa-task"]);
  });

  it("counts as an active filter only when it has values", () => {
    expect(countActiveFilters({ ...noFilters, automation: ["manual"] })).toBe(
      1,
    );
    expect(countActiveFilters({ ...noFilters, automation: [] })).toBe(0);
    expect(countActiveFilters({ ...noFilters, automation: null })).toBe(0);
  });
});
