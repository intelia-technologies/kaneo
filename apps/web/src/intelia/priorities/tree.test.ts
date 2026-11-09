import { describe, expect, it } from "vite-plus/test";
import { parentOptions } from "./tree";

const node = (id: string, parentId: string | null) => ({
  id,
  parentId,
  position: 0,
});

describe("parentOptions", () => {
  it("leaves out the priority and everything under it", () => {
    const items = [
      node("root", null),
      node("a", "root"),
      node("a1", "a"),
      node("a11", "a1"),
      node("b", "root"),
    ];
    expect(parentOptions(items, "a").map((item) => item.id)).toEqual([
      "root",
      "b",
    ]);
    expect(parentOptions(items, null)).toHaveLength(5);
  });
});
