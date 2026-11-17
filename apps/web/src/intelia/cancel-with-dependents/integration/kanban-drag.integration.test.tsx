// Dragging a card into Cancelled (design 82 §3.1, CD-05) against the real API.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
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
import KanbanBoard from "@/components/kanban-board";
import { tasksQueryOptions } from "@/hooks/queries/task/tasks-query-options";
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

const dnd = vi.hoisted(() => ({
  end: null as null | ((event: unknown) => void),
}));

// jsdom has no pointer geometry: the drop is sent straight to the board.
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
// A column is its list of card keys; the cards themselves are not under test.
vi.mock("@/components/kanban-board/column", () => ({
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
vi.mock("@/hooks/use-project-background", () => ({
  useProjectBackground: () => null,
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  useRouter: () => ({ preloadRoute: () => Promise.resolve() }),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "ws" } }),
}));
// React Flow draws nothing without layout: the chain is listed by key.
vi.mock("../components/chain-graph", () => ({
  ChainGraph: ({ graph }: { graph: ChainGraphModel }) => (
    <ul>
      {graph.nodes.map((node) => (
        <li key={node.id} data-ticket={node.data.ticket ?? undefined} />
      ))}
    </ul>
  ),
}));

/** The board page: the tasks query feeds the project store, as the route does. */
function Board({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery(tasksQueryOptions(queryClient, projectId));
  const project = useProjectStore((state) => state.project);
  const setProject = useProjectStore((state) => state.setProject);
  useEffect(() => {
    if (data) setProject(data);
  }, [data, setProject]);
  return project?.id === projectId ? <KanbanBoard project={project} /> : null;
}

const column = (slug: string) => screen.getByTestId(`column-${slug}`);
const cards = (slug: string) =>
  (column(slug).textContent ?? "").split(",").filter(Boolean).sort();

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
  renderApp(<Board projectId={board.projectId} />);
  await waitFor(() => expect(column("to-do")).toHaveTextContent(ticket));
  act(() =>
    dnd.end?.({ active: { id: board.id(ticket) }, over: { id: "cancelled" } }),
  );
}

describe("dragging into Cancelled", () => {
  it("opens panel D with the chain of the 409 and puts the card back", async () => {
    await dropInCancelled("KF-1");

    await expectPanel("KF-1", ["KF-2", "KF-3"]);
    expect(useCancelPanelStore.getState().request?.taskId).toBe(
      board.id("KF-1"),
    );
    await waitFor(() => expect(column("to-do")).toHaveTextContent("KF-1"));
    expect(column("cancelled")).not.toHaveTextContent("KF-1");
    expect(await board.status("KF-1")).toBe("to-do");
  });

  it("after confirming, the board shows the chain cancelled without reloading", async () => {
    await dropInCancelled("KF-1");
    await expectPanel("KF-1", ["KF-2", "KF-3"]);

    await cancelAllInPanel(3);

    await waitFor(() =>
      expect(cards("cancelled")).toEqual(["KF-1", "KF-2", "KF-3"]),
    );
    expect(cards("to-do")).toEqual(["KF-4"]);
  });

  it("without dependents, one drop cancels and no panel opens", async () => {
    await dropInCancelled("KF-4");

    await waitFor(async () =>
      expect(await board.status("KF-4")).toBe("cancelled"),
    );
    expect(cards("cancelled")).toEqual(["KF-4"]);
    expect(useCancelPanelStore.getState().request).toBeNull();
  });
});
