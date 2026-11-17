// The bulk bar and the keyboard (design 82 §3.1 and §4.9 «Lote», CD-05)
// against the real API: a batch whose chain leaves it changes nothing, says
// why and opens panel D for the first root; deleting offers «Cancelar
// primero».
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { useBulkRequestStore } from "@/components/bulk-selection/bulk-request-store";
import BulkToolbar from "@/components/bulk-selection/bulk-toolbar";
import { tasksQueryOptions } from "@/hooks/queries/task/tasks-query-options";
import { ShortcutTestWrapper } from "@/lib/shortcuts/shortcut-test-wrapper";
import { toast } from "@/lib/toast";
import useBulkSelectionStore from "@/store/bulk-selection";
import useProjectStore from "@/store/project";
import type { ChainGraph as ChainGraphModel } from "../chain-graph-model";
import { useCancelPanelStore } from "../entry/cancel-panel-store";
import {
  expectPanel,
  initI18n,
  renderApp,
  seedBoard,
  type SeededBoard,
} from "./harness.integration";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "ws" } }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canUpdateTasks: () => true,
    canDeleteTasks: () => true,
    canAssignTasks: () => true,
    canUpdateLabels: () => true,
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

/** The board's bulk bar and keys, with the board loaded in the store. */
function BoardBar({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery(tasksQueryOptions(queryClient, projectId));
  const setProject = useProjectStore((state) => state.setProject);
  useEffect(() => {
    if (data) setProject(data);
  }, [data, setProject]);
  return data ? (
    <ShortcutTestWrapper>
      <span data-testid="loaded" />
      <BulkToolbar />
    </ShortcutTestWrapper>
  ) : null;
}

beforeAll(initI18n);
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useProjectStore.setState({ project: undefined });
  useBulkSelectionStore.getState().clearSelection();
  useBulkSelectionStore.getState().clearFocus();
  useBulkRequestStore.setState({ request: null, temporaryTaskId: null });
});

let board: SeededBoard;
beforeEach(async () => {
  board = await seedBoard();
});

async function renderBar() {
  renderApp(<BoardBar projectId={board.projectId} />);
  await screen.findByTestId("loaded");
}

const select = (...tickets: string[]) =>
  act(() =>
    useBulkSelectionStore.getState().selectTasks(tickets.map(board.id)),
  );

// Upstream's strings fall back to en-US.
const STATUS_BUTTON = /^Status$/;

const pickStatus = async (status: string) =>
  fireEvent.click(await screen.findByRole("option", { name: status }));

describe("the batch", () => {
  it("whose chain leaves it changes nothing, says why and opens panel D", async () => {
    const error = vi.spyOn(toast, "error");
    await renderBar();
    select("KF-1", "KF-4");
    fireEvent.click(await screen.findByRole("button", { name: STATUS_BUTTON }));
    await pickStatus("Cancelled");

    await expectPanel("KF-1", ["KF-2", "KF-3"]);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("KF-1 tiene 2 tareas abiertas"),
    );
    expect(await board.status("KF-1")).toBe("to-do");
    expect(await board.status("KF-4")).toBe("to-do");
  });

  it("holding its whole chain cancels in one go, without panel", async () => {
    await renderBar();
    select("KF-1", "KF-2", "KF-3");
    fireEvent.click(await screen.findByRole("button", { name: STATUS_BUTTON }));
    await pickStatus("Cancelled");

    await waitFor(async () =>
      expect(await board.status("KF-3")).toBe("cancelled"),
    );
    expect(await board.status("KF-1")).toBe("cancelled");
    expect(useCancelPanelStore.getState().request).toBeNull();
  });

  it("delete of a task with open dependents offers «Cancelar primero»", async () => {
    const error = vi.spyOn(toast, "error");
    await renderBar();
    select("KF-1");
    act(() => useBulkRequestStore.getState().send("delete", null));
    fireEvent.click(await screen.findByRole("button", { name: /^Delete$/ }));

    await waitFor(() => expect(error).toHaveBeenCalled());
    const [message, options] = error.mock.calls[0]!;
    expect(message).toContain("Cancélala antes");
    expect(options?.action?.label).toBe("Cancelar primero");
    expect(await board.status("KF-1")).toBe("to-do");

    act(() => options?.action?.onClick?.());
    await expectPanel("KF-1", ["KF-2", "KF-3"]);
  });
});

describe("the keyboard", () => {
  it("«s» on a focused card, then Cancelled, opens panel D", async () => {
    await renderBar();
    act(() =>
      useBulkSelectionStore.getState().setFocusedTask(board.id("KF-1")),
    );
    fireEvent.keyDown(document.body, { key: "s", code: "KeyS" });
    await pickStatus("Cancelled");

    await expectPanel("KF-1", ["KF-2", "KF-3"]);
    expect(await board.status("KF-1")).toBe("to-do");
  });

  it("«s» on a card without dependents cancels it in one go", async () => {
    await renderBar();
    act(() =>
      useBulkSelectionStore.getState().setFocusedTask(board.id("KF-4")),
    );
    fireEvent.keyDown(document.body, { key: "s", code: "KeyS" });
    await pickStatus("Cancelled");

    await waitFor(async () =>
      expect(await board.status("KF-4")).toBe("cancelled"),
    );
    expect(useCancelPanelStore.getState().request).toBeNull();
  });
});
