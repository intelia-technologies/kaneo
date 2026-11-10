import { describe, expect, it } from "vite-plus/test";
import { type ChainNode, findRoot, MAX_ROOT_DEPTH } from "./root";

const node = (id: string, extra: Partial<ChainNode> = {}): ChainNode => ({
  id,
  visible: true,
  status: "to-do",
  priority: "medium",
  createdAt: new Date("2026-11-01T00:00:00Z"),
  ...extra,
});

// Edges as [target, blocker].
function graph(edges: [string, ChainNode][]) {
  const blockersOf = new Map<string, ChainNode[]>();
  for (const [target, blocker] of edges) {
    blockersOf.set(target, [...(blockersOf.get(target) ?? []), blocker]);
  }
  return blockersOf;
}

describe("findRoot", () => {
  it("finds the first task without pending blockers at the end of a chain of 5", () => {
    const blockersOf = graph([
      ["t", node("b1")],
      ["b1", node("b2")],
      ["b2", node("b3")],
      ["b3", node("b4")],
      ["b4", node("b5")],
    ]);
    expect(findRoot("t", blockersOf)).toEqual({
      kind: "task",
      nodeId: "b5",
      depth: 5,
    });
  });

  it("reports a cycle, also when another branch has a root", () => {
    expect(
      findRoot(
        "t",
        graph([
          ["t", node("a")],
          ["a", node("b")],
          ["b", node("a")],
        ]),
      ),
    ).toEqual({ kind: "cycle", nodeId: null, depth: null });
    expect(
      findRoot(
        "t",
        graph([
          ["t", node("a")],
          ["t", node("leaf")],
          ["a", node("b")],
          ["b", node("t")],
        ]),
      ).kind,
    ).toBe("cycle");
  });

  it("does not take a diamond for a cycle", () => {
    expect(
      findRoot(
        "t",
        graph([
          ["t", node("a")],
          ["t", node("b")],
          ["a", node("c")],
          ["b", node("c")],
        ]),
      ),
    ).toEqual({ kind: "task", nodeId: "c", depth: 2 });
  });

  it("prefers the root in progress, then priority, then age", () => {
    const old = new Date("2026-01-01T00:00:00Z");
    expect(
      findRoot(
        "t",
        graph([
          ["t", node("urgent", { priority: "urgent", createdAt: old })],
          ["t", node("working", { status: "in-review", priority: "low" })],
        ]),
      ).nodeId,
    ).toBe("working");
    expect(
      findRoot(
        "t",
        graph([
          ["t", node("old", { createdAt: old })],
          ["t", node("high", { priority: "high" })],
        ]),
      ).nodeId,
    ).toBe("high");
    expect(
      findRoot(
        "t",
        graph([
          ["t", node("new")],
          ["t", node("old", { createdAt: old })],
        ]),
      ).nodeId,
    ).toBe("old");
  });

  it("stops at hidden and cancelled tasks", () => {
    expect(
      findRoot("t", graph([["t", node("hidden", { visible: false })]])),
    ).toEqual({ kind: "external", nodeId: "hidden", depth: 1 });
    expect(
      findRoot(
        "t",
        graph([
          ["t", node("gone", { status: "cancelled" })],
          ["gone", node("behind")],
        ]),
      ),
    ).toEqual({ kind: "task", nodeId: "gone", depth: 1 });
    expect(
      findRoot(
        "t",
        graph([
          ["t", node("hidden", { visible: false })],
          ["t", node("a")],
          ["a", node("visible")],
        ]),
      ).nodeId,
    ).toBe("visible");
  });

  it("gives up beyond the maximum depth", () => {
    const edges: [string, ChainNode][] = [];
    for (let i = 0; i <= MAX_ROOT_DEPTH; i++) {
      edges.push([i === 0 ? "t" : `n${i}`, node(`n${i + 1}`)]);
    }
    expect(findRoot("t", graph(edges))).toEqual({
      kind: "too_deep",
      nodeId: null,
      depth: null,
    });
    expect(findRoot("t", graph(edges.slice(0, MAX_ROOT_DEPTH)))).toEqual({
      kind: "task",
      nodeId: `n${MAX_ROOT_DEPTH}`,
      depth: MAX_ROOT_DEPTH,
    });
  });
});
