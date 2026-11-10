import type { ReactNode } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { ShortcutTestWrapper } from "@/lib/shortcuts/shortcut-test-wrapper";
import type { ProjectWithTasks } from "@/types/project";
import type Task from "@/types/task";
import BacklogListView from "./index";

const m = vi.hoisted(() => ({
  props: {} as { onDragEnd?: (event: DragEndEvent) => void },
  updateTask: vi.fn(),
  setProject: vi.fn(),
}));

vi.mock("@dnd-kit/core", async (original) => ({
  ...(await original<typeof import("@dnd-kit/core")>()),
  DndContext: (props: typeof m.props & { children: ReactNode }) => {
    m.props = props;
    return props.children;
  },
}));
vi.mock("./backlog-task-row", () => ({ default: () => null }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouter: () => ({ preloadRoute: () => Promise.resolve() }),
}));
vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutate: m.updateTask }),
}));
vi.mock("@/store/project", () => ({
  default: (select: (state: { setProject: typeof m.setProject }) => unknown) =>
    select({ setProject: m.setProject }),
}));
vi.mock("../shared/modals/create-task-modal", () => ({ default: () => null }));
vi.mock("../bulk-selection/backlog-bulk-toolbar", () => ({
  default: () => null,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const task = (id: string, status: string, position: number) =>
  ({ id, status, position, projectId: "p", title: id }) as Task;

// The archived section holds closed tasks with the archive mark: a drop there
// must never rewrite their status to upstream's virtual `archived`.
it("takes no drop in the archived section and never touches the archived tasks", () => {
  const project = {
    id: "p",
    columns: [],
    plannedTasks: [task("planned-1", "planned", 0)],
    archivedTasks: [
      task("done-1", "done", 0),
      task("cancelled-1", "cancelled", 1),
    ],
  } as unknown as ProjectWithTasks;
  const queryClient = new QueryClient();
  render(<BacklogListView project={project} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <ShortcutTestWrapper>{children}</ShortcutTestWrapper>
      </QueryClientProvider>
    ),
  });

  for (const [active, over] of [
    ["planned-1", "archived"],
    ["planned-1", "done-1"],
    ["done-1", "cancelled-1"],
  ]) {
    act(() =>
      m.props.onDragEnd?.({
        active: { id: active },
        over: { id: over },
      } as DragEndEvent),
    );
  }
  expect(m.updateTask).not.toHaveBeenCalled();
  expect(m.setProject).not.toHaveBeenCalled();

  // Taking one out to Planned reopens it, as before.
  act(() =>
    m.props.onDragEnd?.({
      active: { id: "done-1" },
      over: { id: "planned" },
    } as DragEndEvent),
  );
  expect(m.updateTask).toHaveBeenCalledWith(
    expect.objectContaining({ id: "done-1", status: "planned" }),
  );
  expect(m.updateTask).not.toHaveBeenCalledWith(
    expect.objectContaining({ status: "archived" }),
  );
});

it("reports whether the archived section is open and shows its notice instead of an empty list", () => {
  const project = {
    id: "p-notice",
    columns: [],
    plannedTasks: [],
    archivedTasks: [],
  } as unknown as ProjectWithTasks;
  const onArchivedExpandedChange = vi.fn();
  const queryClient = new QueryClient();
  render(
    <BacklogListView
      project={project}
      onArchivedExpandedChange={onArchivedExpandedChange}
      archivedNotice={<p role="alert">load failed</p>}
    />,
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <ShortcutTestWrapper>{children}</ShortcutTestWrapper>
        </QueryClientProvider>
      ),
    },
  );
  expect(onArchivedExpandedChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole("alert").textContent).toBe("load failed");
  expect(screen.queryAllByText("tasks:backlog.noTasksInSection")).toHaveLength(
    1,
  );

  fireEvent.click(
    screen.getByRole("button", { name: /tasks:backlog.sections.archived/ }),
  );
  expect(onArchivedExpandedChange).toHaveBeenLastCalledWith(false);
  expect(screen.queryByRole("alert")).toBeNull();
});
