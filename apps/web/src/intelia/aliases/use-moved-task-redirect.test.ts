import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { useMovedTaskRedirect } from "./use-moved-task-redirect";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

const link = { workspaceId: "ws1", projectId: "p-sf", taskId: "t1" };

describe("useMovedTaskRedirect", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("an old link of a moved task replaces itself with the task in its new project", () => {
    const { result } = renderHook(() =>
      useMovedTaskRedirect({ ...link, taskProjectId: "p-int" }),
    );

    expect(result.current).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
      params: { workspaceId: "ws1", projectId: "p-int", taskId: "t1" },
      replace: true,
    });
  });

  it("a link to the task's own project, or before the task loads, stays", () => {
    const { result, rerender } = renderHook(
      ({ taskProjectId }: { taskProjectId: string | undefined }) =>
        useMovedTaskRedirect({ ...link, taskProjectId }),
      { initialProps: { taskProjectId: undefined as string | undefined } },
    );
    expect(result.current).toBe(false);

    rerender({ taskProjectId: "p-sf" });
    expect(result.current).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
