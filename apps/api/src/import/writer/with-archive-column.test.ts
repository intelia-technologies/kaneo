import type { ImportedColumn, ImportedTask } from "@kaneo/importers";
import { describe, expect, it } from "vite-plus/test";
import { withArchiveColumn } from "./with-archive-column";

const open = (key: string): ImportedColumn => ({
  key,
  name: key,
  isFinal: false,
});

const task = (archived: boolean): ImportedTask => ({
  key: archived ? "archived" : "open",
  columnKey: "todo",
  ...(archived ? { archived: true } : {}),
  title: "Task",
  description: "",
  priority: "no-priority",
  labelKeys: [],
  comments: [],
});

describe("withArchiveColumn", () => {
  it("adds a final Done for archived tasks on a board without one", () => {
    const { columns, added } = withArchiveColumn(
      [open("todo"), open("doing")],
      [task(false), task(true)],
    );
    expect(added).toBe(true);
    expect(columns.slice(0, 2).map((column) => column.key)).toEqual([
      "todo",
      "doing",
    ]);
    expect(columns[2]).toMatchObject({ name: "Done", isFinal: true });
  });

  it("leaves a board with a final column, without archived tasks or without columns", () => {
    const final = [
      open("todo"),
      { key: "shipped", name: "Shipped", isFinal: true },
    ];
    expect(withArchiveColumn(final, [task(true)])).toEqual({
      columns: final,
      added: false,
    });
    expect(withArchiveColumn([open("todo")], [task(false)]).added).toBe(false);
    expect(withArchiveColumn([], [task(true)]).added).toBe(false);
  });
});
