import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ImportTasksDialog } from "@/components/project/tasks-import-export/import-tasks-dialog";

const mocks = vi.hoisted(() => ({
  importTasks: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));
vi.mock("../i18n", () => ({}));
vi.mock("@/intelia/initiatives/i18n", () => ({}));
vi.mock("@/intelia/initiatives/components/initiative-picker", () => ({
  InitiativePicker: ({ onChange }: { onChange: (id: string) => void }) => (
    <button
      type="button"
      data-testid="mock-initiative-picker"
      onClick={() => onChange("init-import")}
    >
      Pick initiative
    </button>
  ),
}));
vi.mock("@/hooks/mutations/task/use-import-tasks", () => ({
  default: () => ({ mutateAsync: mocks.importTasks, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

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
const selectFileButton = () =>
  screen.getByRole("button", { name: "settings:tasksImportExport.selectFile" });
const fileInput = () =>
  document.querySelector('input[type="file"]') as HTMLInputElement;
const chooseInitiative = () =>
  fireEvent.click(screen.getByTestId("mock-initiative-picker"));

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <ImportTasksDialog
      projectId="project-1"
      open
      onOpenChange={onOpenChange}
    />,
    { wrapper },
  );
  return onOpenChange;
}

function pickFile() {
  const file = new File(
    [
      JSON.stringify({
        tasks: [{ title: "Imported", status: "to-do", type: "validacion" }],
      }),
    ],
    "tasks.json",
    { type: "application/json" },
  );
  fireEvent.change(fileInput(), { target: { files: [file] } });
}

describe("ImportTasksDialog automation", () => {
  it("blocks the import, with the reason visible, until automática, verification and delivery are chosen", () => {
    renderDialog();

    expect(option("automatica", "no")).toHaveAttribute("aria-checked", "false");
    expect(option("verification", "yes")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(selectFileButton()).toBeDisabled();
    expect(screen.getByText("intelia:automation.required")).toBeInTheDocument();

    pickFile();
    expect(mocks.importTasks).not.toHaveBeenCalled();

    fireEvent.click(option("automatica", "yes"));
    fireEvent.click(option("verification", "no"));
    expect(selectFileButton()).toBeDisabled();
  });

  it("imports with the chosen automática, verification and delivery for every task", async () => {
    mocks.importTasks.mockResolvedValue({
      results: { successful: 1, failed: 0 },
    });
    const onOpenChange = renderDialog();

    chooseAutomation("yes", "no", "sin_pr");
    chooseInitiative();
    expect(selectFileButton()).toBeEnabled();
    expect(
      screen.queryByText("intelia:automation.required"),
    ).not.toBeInTheDocument();

    pickFile();

    await waitFor(() =>
      expect(mocks.importTasks).toHaveBeenCalledWith({
        projectId: "project-1",
        tasks: [{ title: "Imported", status: "to-do", type: "validacion" }],
        automation: {
          automatica: true,
          verification: false,
          entrega: "sin_pr",
        },
        initiativeId: "init-import",
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
  it("keeps select file disabled until an initiative is chosen, and sends initiativeId", async () => {
    mocks.importTasks.mockResolvedValue({
      results: { successful: 1, failed: 0 },
    });
    renderDialog();

    chooseAutomation("no", "yes", "pr");
    expect(selectFileButton()).toBeDisabled();

    chooseInitiative();
    expect(selectFileButton()).toBeEnabled();

    pickFile();
    await waitFor(() =>
      expect(mocks.importTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project-1",
          automation: { automatica: false, verification: true, entrega: "pr" },
          initiativeId: "init-import",
        }),
      ),
    );
  });
  it("imports legacy records without inventing a classification", async () => {
    mocks.importTasks.mockResolvedValue({
      results: { successful: 2, failed: 0 },
    });
    renderDialog();
    chooseAutomation("no", "yes", "pr");
    chooseInitiative();
    const tasks = [
      { title: "Old", status: "to-do", type: null },
      { title: "Older", status: "to-do" },
    ];
    const file = new File([JSON.stringify({ tasks })], "tasks.json", {
      type: "application/json",
    });
    fireEvent.change(fileInput(), { target: { files: [file] } });
    await waitFor(() =>
      expect(mocks.importTasks).toHaveBeenCalledWith(
        expect.objectContaining({ tasks }),
      ),
    );
  });
  it("applies an explicitly chosen classification only to legacy records", async () => {
    mocks.importTasks.mockResolvedValue({
      results: { successful: 2, failed: 0 },
    });
    renderDialog();
    chooseAutomation("no", "yes", "pr");
    chooseInitiative();
    const file = new File(
      [
        JSON.stringify({
          tasks: [
            { title: "Old", status: "to-do", type: null },
            { title: "Existing", status: "to-do", type: "diseno" },
          ],
        }),
      ],
      "tasks.json",
      { type: "application/json" },
    );
    fireEvent.change(screen.getByLabelText("Tipo para tareas sin clasificar"), {
      target: { value: "validacion" },
    });
    fireEvent.change(fileInput(), { target: { files: [file] } });
    await waitFor(() =>
      expect(mocks.importTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          tasks: [
            {
              title: "Old",
              status: "to-do",
              type: "validacion",
              validationInProduction: null,
              validationInProductionReason: null,
            },
            { title: "Existing", status: "to-do", type: "diseno" },
          ],
        }),
      ),
    );
  });
});
