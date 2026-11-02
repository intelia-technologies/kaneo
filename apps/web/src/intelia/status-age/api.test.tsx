import { setTimeout as sleep } from "node:timers/promises";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { useProjectStatusAge } from "./api";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@kaneo/libs", () => ({
  client: {
    intelia: {
      project: {
        ":projectId": {
          "status-age": {
            $get: (args: { param: { projectId: string } }) =>
              mocks.get(args.param.projectId),
          },
        },
      },
    },
  },
}));

function response(projectId: string) {
  return {
    ok: true,
    json: async () => ({
      tareas: { [`${projectId}-task`]: "2026-11-01T14:02:00.000Z" },
      columnas: {},
      calculado_en: "2026-11-02T20:00:00.000Z",
    }),
  };
}

function setup(projectId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  mocks.get.mockImplementation(async (id: string) => response(id));
  const hook = renderHook(() => useProjectStatusAge(projectId), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { queryClient, hook };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useProjectStatusAge", () => {
  it("refreshes when the project's tasks refresh", async () => {
    const { queryClient, hook } = setup("p1");
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(mocks.get).toHaveBeenCalledTimes(1);

    // A websocket patch or an optimistic move writes the board directly.
    queryClient.setQueryData(["tasks", "p1"], { columns: [] });

    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(mocks.get).toHaveBeenLastCalledWith("p1");
  });

  it("ignores other projects' tasks and other task queries", async () => {
    const { queryClient, hook } = setup("p1");
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    queryClient.setQueryData(["tasks", "p2"], { columns: [] });
    queryClient.setQueryData(["tasks", "p1", "archived"], []);
    queryClient.setQueryData(["task", "p1-task"], { id: "p1-task" });
    await sleep(20);

    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
});
