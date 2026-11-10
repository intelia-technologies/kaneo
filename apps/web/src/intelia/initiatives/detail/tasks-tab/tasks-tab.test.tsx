import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import i18n from "i18next";
import type { ReactNode } from "react";
import { initReactI18next } from "react-i18next";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { useProjectWebSocket } from "@/hooks/use-project-websocket";
import useBulkSelectionStore from "@/store/bulk-selection";
import useProjectStore from "@/store/project";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type { ProjectWithTasks } from "@/types/project";
import type Task from "@/types/task";
import type { InitiativeDetail } from "../../api";
import "../i18n";
import "../../i18n";
import { TasksTab } from "./tasks-tab";

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: "es",
    fallbackLng: "es",
    interpolation: { escapeValue: false },
    resources: {},
  });
} else {
  i18n.changeLanguage("es");
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getTasks: vi.fn(),
  getTask: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ preloadRoute: () => Promise.resolve() }),
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));
vi.mock("@/fetchers/task/get-tasks", () => ({
  default: (...args: unknown[]) => mocks.getTasks(...args),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "ws-1", slug: "ws" } }),
}));
// Mounted closed by the views; it reads the router's location.
vi.mock("@/components/shared/modals/create-task-modal", () => ({
  default: () => null,
}));
// The project's socket, to bring a status change from another client.
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "u" } } }) },
}));
vi.mock("@/fetchers/task/get-task", () => ({
  default: (...args: unknown[]) => mocks.getTask(...args),
}));
vi.mock("@/fetchers/label/get-labels-by-task", () => ({
  default: () => Promise.resolve([]),
}));
vi.mock("@/fetchers/external-link/get-external-links", () => ({
  default: () => Promise.resolve([]),
}));

class Socket {
  static current: Socket | undefined;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  readyState = 1;
  send = vi.fn();
  close = vi.fn();
  constructor() {
    Socket.current = this;
  }
}

const task = (
  id: string,
  number: number,
  title: string,
  status: string,
  extra: Partial<Task> = {},
): Task => ({
  id,
  title,
  number,
  description: null,
  status,
  priority: "high",
  startDate: null,
  dueDate: null,
  position: number,
  createdAt: "2026-11-01T00:00:00.000Z",
  userId: null,
  assigneeId: null,
  assigneeName: null,
  projectId: "proj-1",
  labels: [],
  externalLinks: [],
  ...extra,
});

const column = (slug: string, name: string, tasks: Task[], isFinal = false) =>
  ({
    id: slug,
    slug,
    name,
    icon: null,
    position: 0,
    isFinal,
    tasks,
  }) as unknown as ProjectWithTasks["columns"][number];

const planned = task("t-plan", 1, "Tarea del plan", "to-do", {
  labels: [{ id: "l-1", name: "backend", color: "#ff0000" }],
});
const added = task("t-added", 2, "Tarea añadida", "in-progress");
const unrecorded = task("t-old", 3, "Tarea sin registro", "done");
const cancelled = task("t-cancel", 4, "Tarea cancelada", "cancelled");
const outside = task("t-out", 9, "Tarea de otra iniciativa", "to-do");

function makeBoard(tasks: Task[]): ProjectWithTasks {
  const by = (status: string) => tasks.filter((t) => t.status === status);
  return {
    id: "proj-1",
    name: "Demo",
    slug: "DEMO",
    workspaceId: "ws-1",
    columns: [
      column("to-do", "Por hacer", by("to-do")),
      column("in-progress", "En curso", by("in-progress")),
      column("done", "Hecha", by("done"), true),
      column("cancelled", "Cancelada", by("cancelled"), true),
    ],
    plannedTasks: [],
    archivedTasks: [],
  } as unknown as ProjectWithTasks;
}

const fullBoard = makeBoard([planned, added, unrecorded, cancelled, outside]);

const initiativeTask = (
  source: Task,
  origin: "plan" | "añadido" | "sin_registro",
) => ({
  id: source.id,
  number: source.number,
  projectId: "proj-1",
  projectSlug: "DEMO",
  title: source.title,
  status: source.status,
  origin,
  since: "2026-11-01T00:00:00.000Z",
  assignee: null,
  statusSince: "2026-11-01T00:00:00.000Z",
  blockReason: null,
  blockReasonDetail: null,
  dependsOn: [],
  blocks: [],
});

const initiative = {
  id: "init-1",
  projectId: "proj-1",
  name: "Importación",
  state: "in_flight",
  counters: {
    total: 4,
    active: 2,
    done: 1,
    cancelled: 1,
    blocked: 0,
    plan: { total: 2, active: 1, done: 0 },
    added: { total: 1, active: 1, done: 0 },
    unrecorded: { total: 1, active: 0, done: 1 },
    hidden: { total: 0, active: 0, done: 0 },
  },
  tasks: [
    initiativeTask(planned, "plan"),
    initiativeTask(added, "añadido"),
    initiativeTask(unrecorded, "sin_registro"),
    initiativeTask(cancelled, "plan"),
  ],
  externalTasks: [],
} as unknown as InitiativeDetail;

let queryClient: QueryClient;

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function renderTab() {
  return render(
    <TasksTab initiative={initiative} projectId="proj-1" workspaceId="ws-1" />,
    { wrapper: Providers },
  );
}

const boardLabel = () => i18n.t("tasks:view.board");

const shownTitles = () =>
  [
    "Tarea del plan",
    "Tarea añadida",
    "Tarea sin registro",
    "Tarea cancelada",
    "Tarea de otra iniciativa",
  ].filter((title) => screen.queryByText(title));

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Nothing in this suite may reach a server.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response("{}", { status: 404 }))),
  );
  vi.stubGlobal("WebSocket", Socket);
  mocks.getTasks.mockReset().mockResolvedValue(fullBoard);
  mocks.navigate.mockReset();
  useProjectStore.setState({ project: undefined });
  useBulkSelectionStore.getState().clearSelection();
  useUserPreferencesStore.setState({ viewMode: "board" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("Initiative «Tareas» tab", () => {
  it("shows only the initiative's tasks, grouped by column, with their origin", async () => {
    renderTab();

    await screen.findByText("Tarea del plan");
    // Cancelled keeps its section, folded until opened.
    expect(shownTitles()).toEqual([
      "Tarea del plan",
      "Tarea añadida",
      "Tarea sin registro",
    ]);
    for (const name of ["Por hacer", "En curso", "Hecha", "Cancelada"]) {
      expect(
        screen.getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Añadida")).toBeInTheDocument();
    expect(screen.getByText("Sin registro")).toBeInTheDocument();
    // The board's own chips: the task key and its labels.
    expect(screen.getByText("DEMO-1")).toBeInTheDocument();
    expect(screen.getByText("backend")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Cancelada/ }));
    expect(screen.getByText("Tarea cancelada")).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t("tasks:toolbar.taskCount", { count: 4 })),
    ).toBeInTheDocument();
  });

  it("switches to kanban with the same cards and chips", async () => {
    renderTab();
    await screen.findByText("Tarea del plan");

    fireEvent.click(screen.getByRole("button", { name: boardLabel() }));

    await waitFor(() =>
      expect(document.querySelectorAll("[data-kaneo-sortable]").length).toBe(4),
    );
    expect(shownTitles()).toEqual([
      "Tarea del plan",
      "Tarea añadida",
      "Tarea sin registro",
      "Tarea cancelada",
    ]);
    expect(screen.getAllByText("Plan")).toHaveLength(2);
    expect(screen.getByText("Añadida")).toBeInTheDocument();
    expect(screen.getByText("DEMO-1")).toBeInTheDocument();
    expect(screen.getByText("backend")).toBeInTheDocument();
  });

  it.each([
    [{ origin: ["plan"] }, ["Tarea del plan", "Tarea cancelada"]],
    [{ origin: ["añadido"] }, ["Tarea añadida"]],
    [{ origin: ["sin_registro"] }, ["Tarea sin registro"]],
    [
      { origin: ["plan"], negated: ["origin"] },
      ["Tarea añadida", "Tarea sin registro"],
    ],
  ])("filters by origin %j", async (filters, expected) => {
    window.localStorage.setItem(
      "kaneo:board-filters:initiative:init-1",
      JSON.stringify(filters),
    );
    // Every section open, the cancelled one included.
    window.localStorage.setItem(
      "kaneo:list-collapsed:initiative:init-1",
      JSON.stringify([]),
    );
    renderTab();

    await screen.findByText(expected[0]);
    expect(shownTitles()).toEqual(expected);
    // The active filter's chip in the tab's filter bar.
    expect(screen.getByText("Origen")).toBeInTheDocument();
  });

  it("is read-only: no dragging, no multiple selection, a click opens the task", async () => {
    renderTab();
    const title = await screen.findByText("Tarea del plan");
    const row = title.closest("[data-task-id]") as HTMLElement;

    // Not a dnd-kit sortable: nothing to drag.
    expect(row).not.toHaveAttribute("aria-roledescription");
    expect(
      screen.queryByRole("button", { name: i18n.t("tasks:listView.addTask") }),
    ).not.toBeInTheDocument();

    fireEvent.click(row, { metaKey: true });
    fireEvent.click(row, { shiftKey: true });
    fireEvent.keyDown(row, { key: "x" });
    expect(useBulkSelectionStore.getState().selectedTaskIds.size).toBe(0);

    mocks.navigate.mockClear();
    fireEvent.click(row);
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: ".",
      search: { taskId: "t-plan" },
    });

    fireEvent.click(screen.getByRole("button", { name: boardLabel() }));
    await waitFor(() =>
      expect(document.querySelectorAll("[data-kaneo-sortable]").length).toBe(4),
    );
    const card = document.querySelector(
      '[data-task-id="t-plan"]',
    ) as HTMLElement;
    expect(card).not.toHaveAttribute("aria-roledescription");
    const cardBody = within(card).getByText("Tarea del plan");
    fireEvent.click(cardBody, { metaKey: true });
    expect(useBulkSelectionStore.getState().selectedTaskIds.size).toBe(0);
    expect(
      screen.queryByRole("button", {
        name: i18n.t("tasks:listView.archiveAllTooltip"),
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps the project's board, filters and layout as they were", async () => {
    window.localStorage.setItem(
      "kaneo:board-filters:initiative:init-1",
      JSON.stringify({ origin: ["plan"] }),
    );
    renderTab();
    await screen.findByText("Tarea del plan");
    fireEvent.click(screen.getByRole("button", { name: boardLabel() }));

    expect(window.localStorage.getItem("kaneo:board-filters:proj-1")).toBe(
      null,
    );
    expect(window.localStorage.getItem("kaneo:board-sort:proj-1")).toBe(null);
    expect(window.localStorage.getItem("kaneo:list-collapsed:proj-1")).toBe(
      null,
    );
    expect(useUserPreferencesStore.getState().viewMode).toBe("board");
    // The project's board reads the store and the cache: both stay whole.
    expect(useProjectStore.getState().project).toBe(fullBoard);
    expect(queryClient.getQueryData(["tasks", "proj-1"])).toBe(fullBoard);
  });

  it("says it is loading while pages are still arriving, instead of half the initiative", async () => {
    mocks.getTasks
      .mockReset()
      .mockImplementation(
        (
          _projectId: string,
          _signal: AbortSignal,
          onProgress: (board: ProjectWithTasks) => void,
        ) => {
          onProgress(makeBoard([planned]));
          return new Promise(() => {});
        },
      );
    renderTab();

    expect(
      await screen.findByText("Cargando las tareas del proyecto…"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Tarea del plan")).not.toBeInTheDocument();
  });

  it("shows a status change that arrives over the project's socket", async () => {
    renderTab();
    renderHook(() => useProjectWebSocket("proj-1"), { wrapper: Providers });
    await screen.findByText("Tarea añadida");
    const sectionOf = (title: string) =>
      screen
        .getByText(title)
        .closest("[data-kaneo-sortable]")
        ?.parentElement?.closest(".border-b")
        ?.querySelector("button[aria-expanded]")?.textContent;
    expect(sectionOf("Tarea añadida")).toMatch(/En curso/);

    // Another client moved the task: the server now has it in Done.
    const moved = { ...added, status: "done" };
    mocks.getTask.mockResolvedValue(moved);
    mocks.getTasks.mockResolvedValue(
      makeBoard([planned, moved, unrecorded, cancelled, outside]),
    );
    act(() => {
      Socket.current?.onmessage?.({
        data: JSON.stringify({
          type: "TASK_UPDATED",
          projectId: "proj-1",
          taskId: "t-added",
        }),
      });
    });

    await waitFor(() => expect(sectionOf("Tarea añadida")).toMatch(/Hecha/));
  });

  it("says how many of its tasks the project's board does not show", async () => {
    mocks.getTasks.mockResolvedValue(makeBoard([planned, added, outside]));
    renderTab();

    expect(
      await screen.findByText(
        "2 tareas de la iniciativa no están en el tablero de este proyecto (otro proyecto, backlog o archivadas)",
      ),
    ).toBeInTheDocument();
  });

  it("shows the empty state for an initiative without tasks", () => {
    render(
      <TasksTab
        initiative={{ ...initiative, tasks: [] }}
        projectId="proj-1"
        workspaceId="ws-1"
      />,
      { wrapper: Providers },
    );

    expect(
      screen.getByText("Sin tareas en esta iniciativa"),
    ).toBeInTheDocument();
  });
});
