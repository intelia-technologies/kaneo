import { describe, expect, it } from "vite-plus/test";
import { taskHistory } from "./history";

const at = (hour: number) => new Date(Date.UTC(2026, 10, 4, hour));
const change = (hour: number, oldStatus: string, newStatus: string) => ({
  at: at(hour),
  oldStatus,
  newStatus,
});

describe("taskHistory", () => {
  it("counts In progress and In review but not Blocked, from the first start to the last Done", () => {
    const history = taskHistory(
      { status: "done", createdAt: at(0) },
      [
        change(1, "to-do", "in-progress"),
        change(3, "in-progress", "blocked"),
        change(7, "blocked", "in-progress"),
        change(8, "in-progress", "in-review"),
        change(9, "in-review", "done"),
        change(10, "done", "in-progress"),
        change(11, "in-progress", "done"),
      ],
      at(20),
    );
    expect(history).toEqual({
      actualStart: at(1),
      actualEnd: at(11),
      workedHours: 2 + 1 + 1 + 1,
    });
  });

  it("adds the open stay of a task in progress and has no end", () => {
    const history = taskHistory(
      { status: "in-progress", createdAt: at(0) },
      [change(2, "to-do", "in-progress")],
      at(5),
    );
    expect(history).toEqual({
      actualStart: at(2),
      actualEnd: null,
      workedHours: 3,
    });
  });

  it("starts a task created straight into In progress at its creation", () => {
    expect(
      taskHistory({ status: "in-progress", createdAt: at(1) }, [], at(4)),
    ).toEqual({ actualStart: at(1), actualEnd: null, workedHours: 3 });
  });
});
