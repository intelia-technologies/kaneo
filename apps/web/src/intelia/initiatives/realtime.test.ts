import { QueryClient } from "@tanstack/react-query";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { INITIATIVE_QUERY_ROOT } from "./api";
import {
  cancelInitiativesRefresh,
  INITIATIVES_BURST_MS,
  refreshInitiatives,
} from "./realtime";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function refreshes(client: QueryClient) {
  const spy = vi.spyOn(client, "invalidateQueries");
  return () =>
    spy.mock.calls.filter(
      ([filters]) => filters?.queryKey?.[0] === INITIATIVE_QUERY_ROOT,
    );
}

describe("refreshInitiatives", () => {
  it("reloads once per 5 seconds of task events", () => {
    const client = new QueryClient();
    const calls = refreshes(client);

    for (const type of ["TASK_CREATED", "TASK_UPDATED", "TASK_MOVED"])
      refreshInitiatives(client, "p", type);
    vi.advanceTimersByTime(INITIATIVES_BURST_MS - 1);
    expect(calls()).toEqual([]);

    refreshInitiatives(client, "p", "TASK_RELATION_UPDATED");
    vi.advanceTimersByTime(1);
    // The listing and detail of the project, and the histories: a task
    // reaching In progress may have closed a plan (`plan_closed`).
    expect(calls()).toEqual([
      [{ queryKey: [INITIATIVE_QUERY_ROOT, "project", "p"] }],
      [{ queryKey: [INITIATIVE_QUERY_ROOT, "initiative-history"] }],
    ]);
  });

  it("ignores events that cannot change an initiative", () => {
    const client = new QueryClient();
    const calls = refreshes(client);

    refreshInitiatives(client, "p", "PROJECT_MEMBERS_UPDATED");
    refreshInitiatives(client, "p", undefined);
    vi.advanceTimersByTime(INITIATIVES_BURST_MS);

    expect(calls()).toEqual([]);
  });

  it("groups each project on its own", () => {
    const client = new QueryClient();
    const calls = refreshes(client);

    refreshInitiatives(client, "a", "TASK_UPDATED");
    refreshInitiatives(client, "b", "TASK_UPDATED");
    vi.advanceTimersByTime(INITIATIVES_BURST_MS);

    expect(calls()).toHaveLength(4);
  });

  it("drops the pending reload when the project's socket goes away", () => {
    const client = new QueryClient();
    const calls = refreshes(client);

    refreshInitiatives(client, "p", "TASK_UPDATED");
    vi.advanceTimersByTime(INITIATIVES_BURST_MS - 1);
    cancelInitiativesRefresh("p");
    vi.advanceTimersByTime(INITIATIVES_BURST_MS);

    expect(calls()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);

    // A later event groups again from scratch.
    refreshInitiatives(client, "p", "TASK_UPDATED");
    vi.advanceTimersByTime(INITIATIVES_BURST_MS);
    expect(calls()).toHaveLength(2);
  });
});
