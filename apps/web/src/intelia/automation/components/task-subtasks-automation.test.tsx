import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import TaskSubtasks from "@/components/task/task-subtasks";

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  createRelation: vi.fn(),
  getRelations: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: unknown }) => children,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));
vi.mock("@/hooks/mutations/task/use-create-task", () => ({
  default: () => ({ mutateAsync: mocks.createTask, isPending: false }),
}));
vi.mock("@/hooks/mutations/task-relation/use-create-task-relation", () => ({
  default: () => ({ mutateAsync: mocks.createRelation }),
}));
vi.mock("@/hooks/mutations/task/use-delete-task", () => ({
  useDeleteTask: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-status", () => ({
  useUpdateTaskStatus: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/queries/column/use-get-columns", () => ({
  useGetColumns: () => ({
    data: [{ id: "todo", slug: "to-do", name: "To Do", isFinal: false }],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/queries/task-relation/use-get-task-relations", () => ({
  default: () => mocks.getRelations(),
}));
vi.mock("@/components/task/subtask-row", () => ({
  default: () => <button type="button">Open child</button>,
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
vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canCreateTasks: () => true,
    canUpdateTasks: () => true,
  }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

beforeEach(() => {
  mocks.getRelations.mockReturnValue({ data: [] });
  mocks.createTask.mockResolvedValue({ id: "subtask-1" });
  mocks.createRelation.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const radio = (name: string) => screen.getByRole("radio", { name });

function openAddRow() {
  render(
    <TaskSubtasks
      taskId="parent-1"
      projectId="project-1"
      workspaceId="workspace-1"
      parentStatus="in-progress"
    />,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "tasks:subtasks.addAction tasks:subtasks.title",
    }),
  );
  return screen.getByPlaceholderText("tasks:subtasks.inputPlaceholder");
}

describe("TaskSubtasks automation", () => {
  it("blocks subtask creation until level and verification are chosen, then sends them", async () => {
    const input = openAddRow();
    fireEvent.change(input, { target: { value: "Needs a level" } });
    expect(radio("intelia:automation.levels.manual")).toHaveAttribute(
      "aria-checked",
      "false",
    );

    const addButton = screen.getByRole("button", {
      name: "tasks:subtasks.addAction",
    });
    expect(addButton).toBeDisabled();
    expect(screen.getByText("intelia:automation.required")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(radio("intelia:automation.levels.arranque"));
    expect(addButton).toBeDisabled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.createTask).not.toHaveBeenCalled();

    fireEvent.click(radio("intelia:automation.no"));
    expect(addButton).toBeEnabled();
    fireEvent.click(addButton);
    await waitFor(() => expect(mocks.createTask).toHaveBeenCalledTimes(1));
    expect(mocks.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        automation: { level: "arranque", verification: false },
      }),
    );
  });

  it("asks for the choice again when the add row is reopened", () => {
    const input = openAddRow();
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.click(radio("intelia:automation.levels.manual"));
    fireEvent.click(radio("intelia:automation.yes"));
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:subtasks.addAction tasks:subtasks.title",
      }),
    );
    fireEvent.change(
      screen.getByPlaceholderText("tasks:subtasks.inputPlaceholder"),
      { target: { value: "Another" } },
    );
    expect(
      screen.getByRole("button", { name: "tasks:subtasks.addAction" }),
    ).toBeDisabled();
    expect(radio("intelia:automation.levels.manual")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("keeps the list's keyboard navigation off the level and verification radios", () => {
    mocks.getRelations.mockReturnValue({
      data: [
        {
          id: "relation",
          relationType: "subtask",
          sourceTaskId: "parent-1",
          targetTaskId: "child",
          targetTask: {
            id: "child",
            projectId: "project-1",
            title: "Child",
            status: "to-do",
            isCompleted: false,
          },
        },
      ],
    });
    openAddRow();
    // Focus the existing row so the list's document-level handler is armed.
    fireEvent.mouseDown(screen.getByRole("button", { name: "Open child" }));

    const manual = radio("intelia:automation.levels.manual");
    manual.focus();
    fireEvent.keyDown(manual, { key: "Enter" });

    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
