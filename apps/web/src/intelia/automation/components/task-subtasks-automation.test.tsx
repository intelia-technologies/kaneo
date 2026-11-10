import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
  parentInitiative: {
    taskId: "parent-1",
    initiativeId: "init-1",
    initiativeName: "Parent Initiative",
  } as { taskId: string; initiativeId: string; initiativeName: string } | null,
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
vi.mock("@/intelia/initiatives/api", () => ({
  useTaskInitiative: () => ({
    data: mocks.parentInitiative,
    isLoading: false,
  }),
}));
vi.mock("@/intelia/initiatives/i18n", () => ({}));
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
  mocks.parentInitiative = {
    taskId: "parent-1",
    initiativeId: "init-1",
    initiativeName: "Parent Initiative",
  };
  mocks.getRelations.mockReturnValue({ data: [] });
  mocks.createTask.mockResolvedValue({ id: "subtask-1" });
  mocks.createRelation.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const option = (
  group: "automatica" | "verification" | "entrega",
  value: "yes" | "no" | "pr" | "sin_pr",
) =>
  within(
    screen.getByRole("radiogroup", { name: `intelia:automation.${group}` }),
  ).getByRole("radio", {
    name:
      group === "entrega"
        ? `intelia:automation.card.entrega.${value}`
        : `intelia:automation.${value}`,
  });

function chooseAutomation(
  automatica: "yes" | "no",
  verification: "yes" | "no",
  entrega: "pr" | "sin_pr",
) {
  fireEvent.click(option("automatica", automatica));
  fireEvent.click(option("verification", verification));
  fireEvent.click(option("entrega", entrega));
}

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
  it("blocks subtask creation until automática, verification and delivery are chosen, then sends them", async () => {
    const input = openAddRow();
    fireEvent.change(input, { target: { value: "Needs automation" } });
    fireEvent.change(screen.getByLabelText("Tipo de tarea"), {
      target: { value: "validacion" },
    });
    expect(option("automatica", "no")).toHaveAttribute("aria-checked", "false");

    const addButton = screen.getByRole("button", {
      name: "tasks:subtasks.addAction",
    });
    expect(addButton).toBeDisabled();
    expect(screen.getByText("intelia:automation.required")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(option("automatica", "yes"));
    fireEvent.click(option("verification", "no"));
    expect(addButton).toBeDisabled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.createTask).not.toHaveBeenCalled();

    fireEvent.click(option("entrega", "sin_pr"));
    expect(addButton).toBeEnabled();
    fireEvent.click(addButton);
    await waitFor(() => expect(mocks.createTask).toHaveBeenCalledTimes(1));
    expect(mocks.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        automation: {
          automatica: true,
          verification: false,
          entrega: "sin_pr",
        },
        initiative: { parentTaskId: "parent-1" },
      }),
    );
  });

  it("shows the reason right under the Add row, before the radio groups", () => {
    const input = openAddRow();
    fireEvent.change(input, { target: { value: "Needs automation" } });

    const addButton = screen.getByRole("button", {
      name: "tasks:subtasks.addAction",
    });
    const reason = screen.getByText("intelia:automation.required");
    const firstRadio = option("automatica", "no");

    expect(screen.getAllByText("intelia:automation.required")).toHaveLength(1);
    expect(
      addButton.compareDocumentPosition(reason) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      reason.compareDocumentPosition(firstRadio) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("asks for the choice again when the add row is reopened", () => {
    const input = openAddRow();
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.change(screen.getByLabelText("Tipo de tarea"), {
      target: { value: "validacion" },
    });
    chooseAutomation("no", "yes", "pr");
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
    fireEvent.change(screen.getByLabelText("Tipo de tarea"), {
      target: { value: "validacion" },
    });
    expect(
      screen.getByRole("button", { name: "tasks:subtasks.addAction" }),
    ).toBeDisabled();
    expect(option("automatica", "no")).toHaveAttribute("aria-checked", "false");
  });

  it("keeps the list's keyboard navigation off the automation radios", () => {
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

    const manual = option("automatica", "no");
    manual.focus();
    fireEvent.keyDown(manual, { key: "Enter" });

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("shows inherits from parent and sends { parentTaskId }", async () => {
    const input = openAddRow();
    fireEvent.change(input, { target: { value: "Child subtask" } });
    fireEvent.change(screen.getByLabelText("Tipo de tarea"), {
      target: { value: "validacion" },
    });
    expect(
      screen.getByText("intelia:initiative.inheritsFromParent"),
    ).toBeInTheDocument();

    chooseAutomation("no", "yes", "pr");
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:subtasks.addAction" }),
    );

    await waitFor(() =>
      expect(mocks.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          initiative: { parentTaskId: "parent-1" },
        }),
      ),
    );
  });

  it("blocks subtask creation when parent task has no initiative", () => {
    mocks.parentInitiative = null;
    const input = openAddRow();
    fireEvent.change(input, { target: { value: "Orphan subtask" } });
    fireEvent.change(screen.getByLabelText("Tipo de tarea"), {
      target: { value: "validacion" },
    });
    chooseAutomation("no", "yes", "pr");

    expect(
      screen.getByText("intelia:initiative.parentWithout"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "tasks:subtasks.addAction" }),
    ).toBeDisabled();
  });
});
