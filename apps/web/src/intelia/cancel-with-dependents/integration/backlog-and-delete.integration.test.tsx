// The backlog and the delete dialog of the task detail (design 82 §3.1,
// CD-05) against the real API. The backlog's own drag only moves tasks to
// Planned, so from the backlog a task is cancelled with «Move to board».
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { eq } from "drizzle-orm";
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
import db, { schema } from "../../../../../api/src/database";
import BacklogListView from "@/components/backlog-list-view";
import TaskDeleteDialog from "@/components/task/task-delete-dialog";
import { AlertDialogCreateHandle } from "@/components/ui/alert-dialog";
import { tasksQueryOptions } from "@/hooks/queries/task/tasks-query-options";
import { ShortcutTestWrapper } from "@/lib/shortcuts/shortcut-test-wrapper";
import useBacklogBulkSelectionStore from "@/store/backlog-bulk-selection";
import useProjectStore from "@/store/project";
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

vi.mock("@/components/backlog-list-view/backlog-section", () => ({
  default: () => null,
}));
vi.mock("@/components/shared/modals/create-task-modal", () => ({
  default: () => null,
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  useRouter: () => ({ preloadRoute: () => Promise.resolve() }),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "ws" } }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    isCheckingPermissions: false,
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

function Backlog({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery(tasksQueryOptions(queryClient, projectId));
  const project = useProjectStore((state) => state.project);
  const setProject = useProjectStore((state) => state.setProject);
  useEffect(() => {
    if (data) setProject(data);
  }, [data, setProject]);
  return project?.id === projectId ? (
    <ShortcutTestWrapper>
      <span data-testid="loaded" />
      <BacklogListView project={project} />
    </ShortcutTestWrapper>
  ) : null;
}

beforeAll(initI18n);
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  useProjectStore.setState({ project: undefined });
  useBacklogBulkSelectionStore.getState().clearSelection();
});

let board: SeededBoard;
beforeEach(async () => {
  board = await seedBoard();
});

/** KF-1 and KF-4 to Planned, where the backlog lists them. */
async function plan() {
  for (const ticket of ["KF-1", "KF-4"])
    await db
      .update(schema.taskTable)
      .set({ status: "planned", columnId: null })
      .where(eq(schema.taskTable.id, board.id(ticket)));
}

async function moveToCancelled(ticket: string) {
  renderApp(<Backlog projectId={board.projectId} />);
  await screen.findByTestId("loaded");
  act(() =>
    useBacklogBulkSelectionStore.getState().selectTasks([board.id(ticket)]),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /^Move to board$/ }),
  );
  fireEvent.click(await screen.findByRole("option", { name: "Cancelled" }));
}

describe("the backlog", () => {
  beforeEach(plan);

  it("«Move to board» → Cancelled opens panel D with the chain of the 409", async () => {
    await moveToCancelled("KF-1");

    await expectPanel("KF-1", ["KF-2", "KF-3"]);
    expect(await board.status("KF-1")).toBe("planned");
  });

  it("after confirming, the chain is cancelled", async () => {
    await moveToCancelled("KF-1");
    await expectPanel("KF-1", ["KF-2", "KF-3"]);

    await cancelAllInPanel(3);

    for (const ticket of ["KF-1", "KF-2", "KF-3"])
      expect(await board.status(ticket)).toBe("cancelled");
  });

  it("without dependents, one pick cancels", async () => {
    await moveToCancelled("KF-4");

    await waitFor(async () =>
      expect(await board.status("KF-4")).toBe("cancelled"),
    );
    expect(useCancelPanelStore.getState().request).toBeNull();
  });
});

describe("deleting from the task detail", () => {
  function renderDialog(ticket: string) {
    const handle = AlertDialogCreateHandle();
    renderApp(
      <ShortcutTestWrapper>
        <TaskDeleteDialog
          handle={handle}
          taskId={board.id(ticket)}
          onDeleted={() => {}}
        />
      </ShortcutTestWrapper>,
    );
    act(() => handle.open(null));
  }

  it("with open dependents says why and offers «Cancelar primero», which opens panel D", async () => {
    renderDialog("KF-1");
    fireEvent.click(await screen.findByRole("button", { name: /^Delete/ }));

    expect(
      await screen.findByText(
        /KF-1 tiene tareas abiertas que dependen de ella/,
      ),
    ).toBeInTheDocument();
    expect(await board.status("KF-1")).toBe("to-do");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar primero" }));
    await expectPanel("KF-1", ["KF-2", "KF-3"]);
  });

  it("without dependents, deletes as before", async () => {
    renderDialog("KF-4");
    fireEvent.click(await screen.findByRole("button", { name: /^Delete/ }));

    await waitFor(async () => {
      const [row] = await db
        .select({ id: schema.taskTable.id })
        .from(schema.taskTable)
        .where(eq(schema.taskTable.id, board.id("KF-4")));
      expect(row).toBeUndefined();
    });
    expect(
      screen.queryByRole("button", { name: "Cancelar primero" }),
    ).toBeNull();
  });
});
