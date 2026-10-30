import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Reaction } from "@/types/reaction";
import { ReactionBar } from "./reaction-bar";
import { groupReactions } from "./reaction-utils";

afterEach(cleanup);

const mockToggle = vi.fn();
const mockReactions: Reaction[] = [
  {
    id: "r-1",
    taskId: "task-123",
    commentId: null,
    emoji: "👍",
    userId: "user-alice",
    userName: "Alice",
    externalUserName: null,
    createdAt: "2026-10-29T10:00:00Z",
  },
  {
    id: "r-2",
    taskId: "task-123",
    commentId: null,
    emoji: "👍",
    userId: "user-me",
    userName: "Me",
    externalUserName: null,
    createdAt: "2026-10-29T10:05:00Z",
  },
  {
    id: "r-3",
    taskId: "task-123",
    commentId: null,
    emoji: "🎉",
    userId: "user-bot",
    userName: "BotUser",
    externalUserName: "CI Bot",
    createdAt: "2026-10-29T10:10:00Z",
  },
  {
    id: "r-4",
    taskId: "task-123",
    commentId: "comment-abc",
    emoji: "❤️",
    userId: "user-bob",
    userName: "Bob",
    externalUserName: null,
    createdAt: "2026-10-29T10:15:00Z",
  },
];

vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "user-me", name: "Me", email: "me@example.com" },
  }),
}));

vi.mock("@/hooks/queries/intelia/use-task-reactions", () => ({
  useTaskReactions: () => ({
    data: mockReactions,
  }),
  getTaskReactionsQueryKey: (id: string) => ["intelia-reactions", id],
}));

vi.mock("@/hooks/mutations/intelia/use-toggle-reaction", () => ({
  useToggleReaction: () => ({
    mutate: mockToggle,
    isPending: false,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    children,
  }: {
    children: ReactNode;
    asChild?: boolean;
  }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("reaction-utils: groupReactions", () => {
  it("groups task card reactions correctly and detects own reaction", () => {
    const groups = groupReactions(mockReactions, null, "user-me");
    expect(groups).toHaveLength(2);

    const thumbsUp = groups.find((g) => g.emoji === "👍");
    expect(thumbsUp).toBeDefined();
    expect(thumbsUp?.count).toBe(2);
    expect(thumbsUp?.names).toEqual(["Alice", "Me"]);
    expect(thumbsUp?.hasReacted).toBe(true);

    const party = groups.find((g) => g.emoji === "🎉");
    expect(party).toBeDefined();
    expect(party?.count).toBe(1);
    expect(party?.names).toEqual(["CI Bot"]);
    expect(party?.hasReacted).toBe(false);
  });

  it("filters comment reactions by commentId", () => {
    const groups = groupReactions(mockReactions, "comment-abc", "user-me");
    expect(groups).toHaveLength(1);
    expect(groups[0].emoji).toBe("❤️");
    expect(groups[0].count).toBe(1);
    expect(groups[0].names).toEqual(["Bob"]);
    expect(groups[0].hasReacted).toBe(false);
  });

  it("does not flag own reaction when user reacted under externalUserName", () => {
    const reactionsWithExternal: Reaction[] = [
      {
        id: "r-x",
        taskId: "task-1",
        commentId: null,
        emoji: "🚀",
        userId: "user-me",
        userName: "Me",
        externalUserName: "agent-smith",
        createdAt: "2026-10-29T10:00:00Z",
      },
    ];
    const groups = groupReactions(reactionsWithExternal, null, "user-me");
    expect(groups[0].hasReacted).toBe(false);
    expect(groups[0].names).toEqual(["agent-smith"]);
  });
});

describe("ReactionBar component", () => {
  it("renders card reactions with emoji, count, and highlighted own chip", () => {
    renderWithClient(<ReactionBar taskId="task-123" commentId={null} />);

    const thumbsUpButton = screen.getByRole("button", { name: "👍 2" });
    expect(thumbsUpButton).toBeInTheDocument();
    expect(thumbsUpButton).toHaveAttribute("aria-pressed", "true");

    const partyButton = screen.getByRole("button", { name: "🎉 1" });
    expect(partyButton).toBeInTheDocument();
    expect(partyButton).toHaveAttribute("aria-pressed", "false");
  });

  it("calls toggle reaction when clicking an existing chip", () => {
    renderWithClient(<ReactionBar taskId="task-123" commentId={null} />);

    const thumbsUpButton = screen.getByRole("button", { name: "👍 2" });
    fireEvent.click(thumbsUpButton);

    expect(mockToggle).toHaveBeenCalledWith({
      taskId: "task-123",
      commentId: null,
      emoji: "👍",
      hasReacted: true,
    });
  });
});
