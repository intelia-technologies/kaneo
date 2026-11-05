import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import TaskCard from "@/components/kanban-board/task-card";
import TaskRow from "@/components/list-view/task-row";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type Task from "@/types/task";

const NOW = new Date("2026-11-02T20:00:00Z");

vi.mock("../api", () => ({
  useProjectStatusAge: (projectId: string | undefined) => ({
    data: projectId
      ? {
          tareas: {
            "task-1": new Date(NOW.getTime() - 5 * 3_600_000).toISOString(),
          },
          columnas: {},
          calculado_en: NOW.toISOString(),
        }
      : undefined,
  }),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/queries/external-link/use-external-links", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/hooks/queries/label/use-get-labels-by-task", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/hooks/mutations/task/use-delete-task", () => ({
  useDeleteTask: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "workspace-1" } }),
}));
vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({ data: { members: [] } }),
  }),
);
vi.mock(
  "@/hooks/queries/custom-field/use-get-custom-field-values-by-project",
  () => ({ default: () => ({ data: [] }) }),
);
vi.mock("@/intelia/automation/api", () => ({
  useProjectAutomation: () => ({ data: undefined }),
}));
vi.mock("@/intelia/board-signals/api", () => ({
  useProjectBoardSignals: () => ({ data: undefined }),
}));
vi.mock(
  "@/components/kanban-board/task-card-context-menu/task-card-context-menu-content",
  () => ({ default: () => null }),
);
vi.mock("@/store/project", () => ({
  default: (selector?: (state: unknown) => unknown) => {
    const state = {
      project: {
        id: "project-1",
        slug: "kan",
        columns: [
          { slug: "in-review", name: "In review", isFinal: false },
          { slug: "done", name: "Done", isFinal: true },
        ],
      },
    };
    return selector ? selector(state) : state;
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      key === "tasks:statusAge.hours" ? `${options?.value} h` : key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const task: Task = {
  id: "task-1",
  title: "Waiting for review",
  number: 7,
  description: null,
  status: "in-review",
  priority: null,
  startDate: null,
  dueDate: null,
  position: 1,
  createdAt: "2026-10-01T00:00:00.000Z",
  userId: null,
  assigneeId: null,
  assigneeName: null,
  projectId: "project-1",
  labels: [],
  subtaskCounts: { completed: 0, total: 0 },
  externalLinks: [],
};

const views = {
  list: (props: { task: Task }) => <TaskRow {...props} projectSlug="kan" />,
  board: (props: { task: Task }) => <TaskCard {...props} />,
};

function renderView(view: keyof typeof views, props = { task }) {
  const View = views[view];
  const queryClient = new QueryClient();
  return render(<View {...props} />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  useUserPreferencesStore.setState(useUserPreferencesStore.getInitialState());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe.each(["list", "board"] as const)("status age in the %s", (view) => {
  it("shows the chip by default", () => {
    renderView(view);

    expect(
      screen.getByRole("img", { name: /tasks:statusAge\.label/ }),
    ).toHaveTextContent("5 h");
  });

  it("hides the chip with the preference off", () => {
    useUserPreferencesStore.getState().setShowStatusAge(false);
    renderView(view);

    expect(screen.getByText("Waiting for review")).toBeInTheDocument();
    expect(screen.queryByText("5 h")).toBeNull();
  });

  it("shows no chip in a final column", () => {
    renderView(view, { task: { ...task, status: "done" } });

    expect(screen.getByText("Waiting for review")).toBeInTheDocument();
    expect(screen.queryByText("5 h")).toBeNull();
  });
});
