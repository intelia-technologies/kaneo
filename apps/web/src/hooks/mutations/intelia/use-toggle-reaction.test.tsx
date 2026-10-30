import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { useToggleReaction } from "./use-toggle-reaction";

const {
  mockAddComment,
  mockRemoveComment,
  mockAddTask,
  mockRemoveTask,
  mockToastError,
} = vi.hoisted(() => ({
  mockAddComment: vi.fn(),
  mockRemoveComment: vi.fn(),
  mockAddTask: vi.fn(),
  mockRemoveTask: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    error: mockToastError,
  },
}));

vi.mock("@/fetchers/intelia/add-comment-reaction", () => ({
  addCommentReaction: mockAddComment,
}));
vi.mock("@/fetchers/intelia/remove-comment-reaction", () => ({
  removeCommentReaction: mockRemoveComment,
}));
vi.mock("@/fetchers/intelia/add-task-reaction", () => ({
  addTaskReaction: mockAddTask,
}));
vi.mock("@/fetchers/intelia/remove-task-reaction", () => ({
  removeTaskReaction: mockRemoveTask,
}));

describe("useToggleReaction", () => {
  it("regression: stays in pending state while query refetch is delayed to prevent double-click race condition", async () => {
    // Manual executor because apps/web tsconfig target does not include es2024
    let resolveRefetch!: (value: unknown[]) => void;
    const delayedRefetchPromise = new Promise<unknown[]>((resolve) => {
      resolveRefetch = resolve;
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    // Seed query cache
    await queryClient.prefetchQuery({
      queryKey: ["intelia-reactions", "task-delayed"],
      queryFn: () => Promise.resolve([]),
    });

    // Configure query to return the delayed promise on refetch/invalidation
    queryClient.setQueryDefaults(["intelia-reactions", "task-delayed"], {
      queryFn: () => delayedRefetchPromise,
    });

    mockAddComment.mockResolvedValueOnce({ id: "r-delayed", emoji: "👍" });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => ({
        reactions: useQuery({
          queryKey: ["intelia-reactions", "task-delayed"],
          queryFn: () => delayedRefetchPromise,
        }),
        toggle: useToggleReaction(),
      }),
      { wrapper },
    );

    let mutationPromise: Promise<unknown>;
    act(() => {
      mutationPromise = result.current.toggle.mutateAsync({
        taskId: "task-delayed",
        commentId: "c-1",
        emoji: "👍",
        hasReacted: false,
      });
    });

    // Wait until mutationFn has executed and resolved
    await waitFor(() => {
      expect(mockAddComment).toHaveBeenCalled();
    });

    // Crucial check: because onSuccess returned queryClient.invalidateQueries(...),
    // and the refetch is still pending, isPending MUST remain true!
    expect(result.current.toggle.isPending).toBe(true);

    // Resolve the refetch
    act(() => {
      resolveRefetch([]);
    });

    await act(async () => {
      await mutationPromise;
    });

    // Now mutation settles to completed
    await waitFor(() => {
      expect(result.current.toggle.isPending).toBe(false);
    });
    expect(result.current.toggle.isSuccess).toBe(true);
  });
  it("displays toast error when mutation fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    mockAddComment.mockRejectedValueOnce(new Error("Permission denied"));

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useToggleReaction(), { wrapper });

    await act(async () => {
      try {
        await result.current.mutateAsync({
          taskId: "task-1",
          commentId: "c-1",
          emoji: "👍",
          hasReacted: false,
        });
      } catch {
        // expected
      }
    });

    expect(mockToastError).toHaveBeenCalledWith("Permission denied");
  });
});
