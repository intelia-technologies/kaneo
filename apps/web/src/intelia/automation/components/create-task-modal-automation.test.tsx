import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import CreateTaskModal from "@/components/shared/modals/create-task-modal";

const createTask = vi.fn(async (input: Record<string, unknown>) => ({
  id: "task-1",
  title: input.title,
  status: input.status,
  projectId: input.projectId,
  createdAt: "2026-08-05T00:00:00.000Z",
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: "/dashboard/workspace/workspace-1" }),
  useParams: ({
    select,
  }: {
    select: (params: { workspaceId?: string }) => unknown;
  }) => select({ workspaceId: "workspace-1" }),
}));
vi.mock("@/components/task/task-description-editor", () => ({
  default: () => <textarea data-testid="description-editor" />,
}));
vi.mock("@/hooks/mutations/label/use-create-label", () => ({
  default: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/mutations/task/use-create-task", () => ({
  default: () => ({ mutateAsync: createTask }),
}));
vi.mock("@/hooks/mutations/task/use-delete-task", () => ({
  useDeleteTask: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/queries/label/use-get-labels-by-workspace", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "workspace-1", name: "WS" } }),
}));
vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({ data: { members: [] } }),
  }),
);
vi.mock("@/hooks/queries/workspace-users/use-get-project-members", () => ({
  default: () => ({ data: undefined }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canCreateTasks: () => true,
    canCreateLabels: () => true,
  }),
}));
vi.mock("@/hooks/queries/column/use-get-columns", () => ({
  useGetColumns: () => ({
    data: [{ id: "todo", slug: "to-do", name: "To Do", isFinal: false }],
    isError: false,
    isFetching: false,
    refetch: async () => ({
      data: [{ id: "todo", slug: "to-do", name: "To Do", isFinal: false }],
      isError: false,
    }),
  }),
}));
vi.mock(
  "@/hooks/queries/custom-field/use-get-custom-fields-by-project",
  () => ({ default: () => ({ data: undefined }) }),
);
vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({
    data: [{ id: "project-2", name: "Beta", slug: "bet" }],
  }),
}));
vi.mock("@/store/project", () => ({
  default: () => ({ project: null, setProject: vi.fn() }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/intelia/initiatives/components/initiative-create-field", () => ({
  InitiativeCreateField: ({
    value,
    onChange,
  }: {
    value: string | null;
    onChange: (id: string) => void;
  }) => (
    <button
      type="button"
      data-testid="mock-initiative-picker"
      onClick={() => onChange("init-1")}
    >
      {value ? `Initiative ${value}` : "Pick initiative"}
    </button>
  ),
}));
vi.mock("@/intelia/initiatives/i18n", () => ({}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const renderModal = () =>
  render(<CreateTaskModal open onClose={vi.fn()} projectId="project-2" />, {
    wrapper: createWrapper(),
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

function enterTitle(title: string) {
  fireEvent.change(
    screen.getByPlaceholderText(
      "common:modals.createTask.taskTitlePlaceholder",
    ),
    { target: { value: title } },
  );
  fireEvent.change(screen.getByLabelText("Tipo de tarea"), {
    target: { value: "validacion" },
  });
}

function chooseAutomation(
  automatica: "yes" | "no",
  verification: "yes" | "no",
  entrega: "pr" | "sin_pr",
) {
  fireEvent.click(option("automatica", automatica));
  fireEvent.click(option("verification", verification));
  fireEvent.click(option("entrega", entrega));
}

function chooseInitiative() {
  fireEvent.click(screen.getByTestId("mock-initiative-picker"));
}
function submit() {
  fireEvent.submit(document.querySelector("form") as HTMLFormElement);
}

describe("CreateTaskModal automation", () => {
  it("requires a task type even when all other fields are complete", () => {
    renderModal();
    enterTitle("Task");
    fireEvent.change(screen.getByLabelText("Tipo de tarea"), {
      target: { value: "" },
    });
    chooseAutomation("no", "yes", "pr");
    chooseInitiative();
    expect(screen.getByLabelText("Tipo de tarea")).toBeInvalid();
    submit();
    expect(createTask).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Tipo de tarea"), {
      target: { value: "validacion" },
    });
    expect(screen.getByLabelText("Tipo de tarea")).toBeValid();
  });

  it("keeps Create Task disabled, with the reason visible, until automática, verification and delivery are chosen", async () => {
    renderModal();
    enterTitle("Task");
    const createButton = screen.getByText(
      "common:modals.createTask.createButton",
    );
    for (const [group, value] of [
      ["automatica", "yes"],
      ["verification", "yes"],
      ["entrega", "pr"],
    ] as const) {
      expect(option(group, value)).toHaveAttribute("aria-checked", "false");
    }
    expect(screen.queryByText(/levels?\./)).not.toBeInTheDocument();
    expect(createButton).toBeDisabled();
    expect(screen.getByText("intelia:automation.required")).toBeInTheDocument();

    submit();
    expect(createTask).not.toHaveBeenCalled();

    fireEvent.click(option("automatica", "yes"));
    fireEvent.click(option("verification", "no"));
    chooseInitiative();
    submit();
    expect(createTask).not.toHaveBeenCalled();

    fireEvent.click(option("entrega", "sin_pr"));
    expect(createButton).toBeEnabled();
    expect(
      screen.queryByText("intelia:automation.required"),
    ).not.toBeInTheDocument();
    submit();
    await vi.waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          automation: {
            automatica: true,
            verification: false,
            entrega: "sin_pr",
          },
        }),
      ),
    );
  });

  it("shows the reason in the footer row, beside the buttons, not below the scrolling fields", () => {
    renderModal();
    const reason = screen.getByText("intelia:automation.required");
    const footer = screen
      .getByText("common:modals.createTask.createButton")
      .closest('[data-slot="dialog-footer"]');

    expect(footer).not.toBeNull();
    expect(footer).toContainElement(reason);
    expect(reason.closest(".overflow-y-auto")).toBeNull();
  });

  it("does not create from the keyboard shortcut without the choice", async () => {
    renderModal();
    enterTitle("Task");
    fireEvent.keyDown(document, { key: "Enter", ctrlKey: true });
    expect(screen.getByText("intelia:automation.required")).toBeInTheDocument();
    expect(createTask).not.toHaveBeenCalled();

    chooseAutomation("yes", "yes", "pr");
    chooseInitiative();
    fireEvent.keyDown(document, { key: "Enter", ctrlKey: true });
    await vi.waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          automation: {
            automatica: true,
            verification: true,
            entrega: "pr",
          },
        }),
      ),
    );
  });

  it("asks for the choice again for the next task when creating more", async () => {
    renderModal();
    fireEvent.click(
      screen.getByLabelText("common:modals.createTask.createMore"),
    );
    enterTitle("First");
    chooseAutomation("no", "yes", "pr");
    chooseInitiative();
    submit();
    await vi.waitFor(() => expect(createTask).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(option("automatica", "no")).toHaveAttribute(
        "aria-checked",
        "false",
      ),
    );
    expect(option("entrega", "pr")).toHaveAttribute("aria-checked", "false");
    enterTitle("Second");
    chooseInitiative();
    submit();
    expect(createTask).toHaveBeenCalledOnce();
  });
  it("keeps Create Task disabled with InitiativeRequiredReason until an initiative is chosen, then sends { id }", async () => {
    renderModal();
    enterTitle("Initiative test task");
    chooseAutomation("no", "yes", "pr");

    const createButton = screen.getByText(
      "common:modals.createTask.createButton",
    );
    expect(createButton).toBeDisabled();
    expect(screen.getByText("intelia:initiative.required")).toBeInTheDocument();

    submit();
    expect(createTask).not.toHaveBeenCalled();

    chooseInitiative();
    expect(createButton).toBeEnabled();
    expect(
      screen.queryByText("intelia:initiative.required"),
    ).not.toBeInTheDocument();

    submit();
    await vi.waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          initiative: { id: "init-1" },
        }),
      ),
    );
  });
});
