// Cancelling from the card menu, the task detail and the subtask list (design
// 82 §3.1, CD-05) against the real API.
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import TaskCardContextMenuContent from "@/components/kanban-board/task-card-context-menu/task-card-context-menu-content";
import SubtaskStatusPopover from "@/components/task/subtask-status-popover";
import TaskStatusPopover from "@/components/task/task-status-popover";
import { Button } from "@/components/ui/button";
import getTask from "@/fetchers/task/get-task";
import type Task from "@/types/task";
import type { ChainGraph as ChainGraphModel } from "../chain-graph-model";
import { useCancelPanelStore } from "../entry/cancel-panel-store";
import {
  cancelAllInPanel,
  expectPanel,
  initI18n,
  renderApp,
  seedBoard,
  type SeededBoard,
} from "./harness.integration";

// The menu's primitives as plain buttons: what is under test is what a pick
// does, not how a context menu opens in jsdom.
vi.mock("@/components/ui/context-menu", () => {
  const Plain = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ContextMenuContent: Plain,
    ContextMenuSub: Plain,
    ContextMenuSubContent: Plain,
    ContextMenuSubTrigger: Plain,
    ContextMenuSeparator: () => <hr />,
    ContextMenuItem: ({
      children,
      onClick,
    }: {
      children: ReactNode;
      onClick?: () => void;
    }) => (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
    ContextMenuCheckboxItem: ({
      children,
      checked,
      onCheckedChange,
    }: {
      children: ReactNode;
      checked?: boolean;
      onCheckedChange?: () => void;
    }) => (
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={Boolean(checked)}
        onClick={onCheckedChange}
      >
        {children}
      </button>
    ),
  };
});
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "ws" } }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canCreateTasks: () => true,
    canUpdateTasks: () => true,
    canDeleteTasks: () => true,
    canAssignTasks: () => true,
  }),
}));
vi.mock("../components/chain-graph", () => ({
  ChainGraph: ({ graph }: { graph: ChainGraphModel }) => (
    <ul>
      {graph.nodes.map((node) => (
        <li key={node.id} data-ticket={node.data.ticket ?? undefined} />
      ))}
    </ul>
  ),
}));

beforeAll(initI18n);
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

let board: SeededBoard;
beforeEach(async () => {
  board = await seedBoard();
});

const task = async (ticket: string) =>
  (await getTask(board.id(ticket))) as unknown as Task;

function renderMenu(subject: Task) {
  return renderApp(
    <TaskCardContextMenuContent
      task={subject}
      taskCardContext={{
        worskpaceId: board.workspaceId,
        projectId: board.projectId,
      }}
      onDeleteClick={() => {}}
    />,
  );
}

const pickCancelled = async () =>
  fireEvent.click(
    await screen.findByRole("menuitemcheckbox", { name: /Cancelled/ }),
  );

const pickCancelledOption = async (trigger: string) => {
  fireEvent.click(screen.getByRole("button", { name: trigger }));
  fireEvent.click(await screen.findByRole("option", { name: /Cancelled/ }));
};

describe("the card menu", () => {
  it("opens panel D with the chain of the 409 and changes nothing", async () => {
    renderMenu(await task("KF-1"));
    await pickCancelled();

    await expectPanel("KF-1", ["KF-2", "KF-3"]);
    expect(await board.status("KF-1")).toBe("to-do");
  });

  it("without dependents, one pick cancels", async () => {
    renderMenu(await task("KF-4"));
    await pickCancelled();

    await waitFor(async () =>
      expect(await board.status("KF-4")).toBe("cancelled"),
    );
    expect(useCancelPanelStore.getState().request).toBeNull();
  });

  it("after confirming in the panel, the chain is cancelled", async () => {
    renderMenu(await task("KF-1"));
    await pickCancelled();
    await expectPanel("KF-1", ["KF-2", "KF-3"]);

    await cancelAllInPanel(3);

    for (const ticket of ["KF-1", "KF-2", "KF-3"])
      expect(await board.status(ticket)).toBe("cancelled");
  });
});

describe("the status in the task detail", () => {
  it("opens panel D with the chain of the 409", async () => {
    renderApp(
      <TaskStatusPopover task={await task("KF-1")}>
        <Button>Estado</Button>
      </TaskStatusPopover>,
    );
    await pickCancelledOption("Estado");

    await expectPanel("KF-1", ["KF-2", "KF-3"]);
    expect(await board.status("KF-1")).toBe("to-do");
  });

  it("without dependents, one pick cancels", async () => {
    renderApp(
      <TaskStatusPopover task={await task("KF-4")}>
        <Button>Estado</Button>
      </TaskStatusPopover>,
    );
    await pickCancelledOption("Estado");

    await waitFor(async () =>
      expect(await board.status("KF-4")).toBe("cancelled"),
    );
    expect(useCancelPanelStore.getState().request).toBeNull();
  });
});

describe("the status of several subtasks", () => {
  it("cancels the free one and opens panel D for the one with dependents", async () => {
    renderApp(
      <SubtaskStatusPopover
        tasks={[await task("KF-1"), await task("KF-4")]}
        projectId={board.projectId}
      >
        <Button>Estado</Button>
      </SubtaskStatusPopover>,
    );
    await pickCancelledOption("Estado");

    await expectPanel("KF-1", ["KF-2", "KF-3"]);
    expect(useCancelPanelStore.getState().request?.taskId).toBe(
      board.id("KF-1"),
    );
    expect(await board.status("KF-4")).toBe("cancelled");
    expect(await board.status("KF-1")).toBe("to-do");
  });
});
