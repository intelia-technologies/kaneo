import { describe, expect, it } from "vite-plus/test";
import type { BoardFilters } from "@/hooks/use-task-filters";
import { countActiveFilters } from "@/lib/task-filters/count-active-filters";
import {
  type TaskFilterContext,
  taskMatchesFilters,
} from "@/lib/task-filters/task-matches-filters";
import type Task from "@/types/task";
import { isAutomationFilterValue } from "./filter";

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
    ["auto-task", { automatica: true, pausaMotivo: null }],
    ["manual-task", { automatica: false, pausaMotivo: null }],
    ["paused-task", { automatica: false, pausaMotivo: "movida_a_mano" }],
  ]),
};

const tasks = ["auto-task", "manual-task", "paused-task", "bare-task"].map(
  (id) => ({ id, title: id, status: "todo" }) as Task,
);

function visible(filters: Partial<BoardFilters>) {
  return tasks
    .filter((task) =>
      taskMatchesFilters(task, { ...noFilters, ...filters }, context),
    )
    .map((task) => task.id);
}

describe("automation filter", () => {
  it("shows every task without a selection", () => {
    expect(visible({})).toEqual(tasks.map((task) => task.id));
  });

  it("tells each task apart", () => {
    expect(visible({ automation: ["automatica"] })).toEqual(["auto-task"]);
    expect(visible({ automation: ["manual"] })).toEqual(["manual-task"]);
    expect(visible({ automation: ["paused"] })).toEqual(["paused-task"]);
    expect(visible({ automation: ["none"] })).toEqual(["bare-task"]);
  });

  it("skips the filter while the project map is not loaded", () => {
    const unloaded = { ...context, automation: undefined };
    expect(
      tasks.filter((task) =>
        taskMatchesFilters(
          task,
          { ...noFilters, automation: ["automatica"] },
          unloaded,
        ),
      ),
    ).toEqual(tasks);
  });

  it("matches any of several selected values", () => {
    expect(visible({ automation: ["manual", "paused"] })).toEqual([
      "manual-task",
      "paused-task",
    ]);
  });

  it("negated, keeps every other value and the tasks without automation", () => {
    expect(
      visible({ automation: ["automatica"], negated: ["automation"] }),
    ).toEqual(["manual-task", "paused-task", "bare-task"]);
  });

  it("combines with the other filters", () => {
    expect(
      visible({ automation: ["automatica", "paused"], status: ["done"] }),
    ).toEqual([]);
    expect(
      visible({ automation: ["automatica", "paused"], status: ["todo"] }),
    ).toEqual(["auto-task", "paused-task"]);
  });

  it("keeps only the current values of a stored filter", () => {
    expect(
      ["arranque", "completa", "manual", 3].filter(isAutomationFilterValue),
    ).toEqual(["manual"]);
  });

  it("counts as an active filter only when it has values", () => {
    expect(countActiveFilters({ ...noFilters, automation: ["manual"] })).toBe(
      1,
    );
    expect(countActiveFilters({ ...noFilters, automation: [] })).toBe(0);
    expect(countActiveFilters({ ...noFilters, automation: null })).toBe(0);
  });
});
