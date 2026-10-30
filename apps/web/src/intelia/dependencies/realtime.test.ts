import { QueryClient } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { BURST_MS, refreshDependencies, useBurstValue } from "./realtime";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

function relationRefreshes(client: QueryClient) {
  const spy = vi.spyOn(client, "invalidateQueries");
  return () => spy.mock.calls.map(([filters]) => filters?.queryKey);
}

describe("refreshDependencies", () => {
  it("reads the relations once per burst of task events", () => {
    const client = new QueryClient();
    const calls = relationRefreshes(client);

    for (const type of [
      "TASK_CREATED",
      "TASK_UPDATED",
      "TASK_DELETED",
      "TASK_MOVED",
      "TASK_RELATION_UPDATED",
    ])
      refreshDependencies(client, "p", type);
    expect(calls()).toEqual([]);

    vi.advanceTimersByTime(BURST_MS);
    expect(calls()).toEqual([["project-relations", "p"]]);

    refreshDependencies(client, "p", "TASK_MOVED");
    vi.advanceTimersByTime(BURST_MS);
    expect(calls()).toHaveLength(2);
  });

  it("ignores events that cannot change relations", () => {
    const client = new QueryClient();
    const calls = relationRefreshes(client);

    for (const type of [
      "COMMENT_UPDATED",
      "TASK_LABEL_UPDATED",
      "TASKS_REORDERED",
      "PROJECT_MEMBERS_UPDATED",
      "constructor",
      null,
    ])
      refreshDependencies(client, "p", type);
    vi.advanceTimersByTime(BURST_MS);

    expect(calls()).toEqual([]);
  });

  it("keeps bursts of different projects apart", () => {
    const client = new QueryClient();
    const calls = relationRefreshes(client);

    refreshDependencies(client, "a", "TASK_UPDATED");
    refreshDependencies(client, "b", "TASK_UPDATED");
    vi.advanceTimersByTime(BURST_MS);

    expect(calls()).toEqual([
      ["project-relations", "a"],
      ["project-relations", "b"],
    ]);
  });
});

describe("useBurstValue", () => {
  const isComplete = (value: number | undefined) => value !== undefined;

  it("shows the first load at once", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useBurstValue(value, isComplete),
      { initialProps: { value: undefined as number | undefined } },
    );
    expect(result.current).toBeUndefined();

    rerender({ value: 1 });
    expect(result.current).toBe(1);
  });

  it("shows only the latest value of a burst, once", () => {
    const seen: number[] = [];
    const { result, rerender } = renderHook(
      ({ value }) => {
        const shown = useBurstValue<number | undefined>(value, isComplete);
        if (seen.at(-1) !== shown) seen.push(shown as number);
        return shown;
      },
      { initialProps: { value: 1 } },
    );

    rerender({ value: 2 });
    rerender({ value: 3 });
    rerender({ value: 4 });
    expect(result.current).toBe(1);

    act(() => vi.advanceTimersByTime(BURST_MS));
    expect(result.current).toBe(4);
    expect(seen).toEqual([1, 4]);
  });

  it("keeps refreshing during a steady stream of changes", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useBurstValue<number | undefined>(value, isComplete),
      { initialProps: { value: 0 } },
    );

    const step = BURST_MS / 5;
    for (let value = 1; value <= 10; value++) {
      rerender({ value });
      act(() => vi.advanceTimersByTime(step));
    }

    expect(result.current).toBe(10);
  });
});
