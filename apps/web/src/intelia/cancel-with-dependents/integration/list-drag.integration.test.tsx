// Dragging a row into Cancelled in the list view (design 82 §3.1, CD-05)
// against the real API.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import ListView from "@/components/list-view";
import { tasksQueryOptions } from "@/hooks/queries/task/tasks-query-options";
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

const dnd = vi.hoisted(() => ({
  end: null as null | ((event: unknown) => void),
}));

// jsdom has no pointer geometry: the drop is sent straight to the list.
vi.mock("@dnd-kit/core", async (original) => ({
  ...(await original<typeof import("@dnd-kit/core")>()),
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: ReactNode;
    onDragEnd: (event: unknown) => void;
  }) => {
    dnd.end = onDragEnd;
    return <>{children}</>;
  },
  DragOverlay: () => null,
}));
// A section is its list of row keys; the rows themselves are not under test.
vi.mock("@/components/list-view/list-column-section", () => ({
  default: ({
    column,
  }: {
    column: { id: string; tasks: { number: number | null }[] };
  }) => (
    <div data-testid={`column-${column.id}`}>
      {column.tasks.map((task) => `KF-${task.number}`).join(",")}
    </div>
  ),
}));
vi.mock("@/components/bulk-selection/bulk-toolbar", () => ({
  default: () => null,
}));
// It reads the router's location; creating is not under test.
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
vi.mock("../components/chain-graph", () => ({
  ChainGraph: ({ graph }: { graph: ChainGraphModel }) => (
    <ul>
      {graph.nodes.map((node) => (
        <li key={node.id} data-ticket={node.data.ticket ?? undefined} />
      ))}
    </ul>
  ),
}));

/** The list page: the tasks query feeds the project store, as the route does. */
function List({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery(tasksQueryOptions(queryClient, projectId));
  const project = useProjectStore((state) => state.project);
  const setProject = useProjectStore((state) => state.setProject);
  useEffect(() => {
    if (data) setProject(data);
  }, [data, setProject]);
  return project?.id === projectId ? <ListView project={project} /> : null;
}

const rows = (slug: string) =>
  (screen.getByTestId(`column-${slug}`).textContent ?? "")
    .split(",")
    .filter(Boolean)
    .sort();

beforeAll(initI18n);
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  useProjectStore.setState({ project: undefined });
});

let board: SeededBoard;
beforeEach(async () => {
  board = await seedBoard();
});

async function dropInCancelled(ticket: string) {
  renderApp(<List projectId={board.projectId} />);
  await waitFor(() => expect(rows("to-do")).toContain(ticket));
  act(() =>
    dnd.end?.({ active: { id: board.id(ticket) }, over: { id: "cancelled" } }),
  );
}

describe("dragging a list row into Cancelled", () => {
  it("opens panel D with the chain of the 409 and puts the row back", async () => {
    await dropInCancelled("KF-1");

    await expectPanel("KF-1", ["KF-2", "KF-3"]);
    await waitFor(() =>
      expect(rows("to-do")).toEqual(["KF-1", "KF-2", "KF-3", "KF-4"]),
    );
    expect(rows("cancelled")).toEqual([]);
    expect(await board.status("KF-1")).toBe("to-do");
  });

  it("without dependents, one drop cancels and no panel opens", async () => {
    await dropInCancelled("KF-4");

    await waitFor(async () =>
      expect(await board.status("KF-4")).toBe("cancelled"),
    );
    expect(rows("cancelled")).toEqual(["KF-4"]);
    expect(useCancelPanelStore.getState().request).toBeNull();
  });
});
