// Dragging a card into Cancelled (design 82 §3.1, CD-05) against the real API.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
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
import useGetProjectTaskRelations from "@/hooks/queries/task-relation/use-get-project-task-relations";
import useProjectStore from "@/store/project";
import type { ChainGraph as ChainGraphModel } from "../chain-graph-model";
import { useCancelPanelStore } from "../entry/cancel-panel-store";
import {
  cancelAllInPanel,
  chainNode,
  expectPanel,
  REASON,
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
const workspace = vi.hoisted(() => ({ id: "" }));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: workspace.id } }),
}));
// React Flow draws nothing without layout: the canvas becomes a plain list of
// the same node components, so they can be picked.
vi.mock("../components/chain-graph", async () => {
  const { ReactFlowProvider } = await import("@xyflow/react");
  const { ChainNode } = await import("../components/chain-node");
  return {
    ChainGraph: ({ graph }: { graph: ChainGraphModel }) => (
      <ReactFlowProvider>
        {graph.nodes.map((node) => (
          <ChainNode
            key={node.id}
            {...({ id: node.id, data: node.data } as Parameters<
              typeof ChainNode
            >[0])}
          />
        ))}
      </ReactFlowProvider>
    ),
  };
});

/** The project's `blocks` edges by key, from the query the views share. */
function Edges({ projectId }: { projectId: string }) {
  const { data } = useGetProjectTaskRelations(projectId);
  const project = useProjectStore((state) => state.project);
  const key = (id: string) => {
    const task = project?.columns
      .flatMap((column) => column.tasks)
      .find((t) => t.id === id);
    return task ? `KF-${task.number}` : id;
  };
  return (
    <p data-testid="edges">
      {(data ?? [])
        .filter((r) => r.relationType === "blocks")
        .map((r) => `${key(r.sourceTaskId)}>${key(r.targetTaskId)}`)
        .sort()
        .join(",")}
    </p>
  );
}
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
  workspace.id = board.workspaceId;
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

  it("after moving a dependency in the panel, the board and its relations follow without reloading", async () => {
    renderApp(
      <>
        <Board projectId={board.projectId} />
        <Edges projectId={board.projectId} />
      </>,
    );
    await waitFor(() => expect(cards("to-do")).toContain("KF-1"));
    await waitFor(() =>
      expect(screen.getByTestId("edges")).toHaveTextContent("KF-1>KF-2"),
    );
    act(() =>
      dnd.end?.({
        active: { id: board.id("KF-1") },
        over: { id: "cancelled" },
      }),
    );
    await expectPanel("KF-1", ["KF-2", "KF-3"]);

    // KF-2's dependency passes to KF-4, picked in the search.
    fireEvent.click(chainNode("KF-2")!);
    fireEvent.click(screen.getByRole("button", { name: /Mover a…/ }));
    fireEvent.change(
      screen.getByLabelText("Tarea a la que pasa la dependencia"),
      { target: { value: "Tarea KF-4" } },
    );
    fireEvent.click(
      (await screen.findByText("KF-4", { selector: "span" })).closest(
        "button",
      )!,
    );
    fireEvent.change(screen.getByLabelText("Motivo"), {
      target: { value: REASON },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar 1 tarea" }));

    await waitFor(() => expect(cards("cancelled")).toEqual(["KF-1"]));
    expect(cards("to-do")).toEqual(["KF-2", "KF-3", "KF-4"]);
    await waitFor(() =>
      expect(screen.getByTestId("edges").textContent).toBe(
        "KF-2>KF-3,KF-4>KF-2",
      ),
    );
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
