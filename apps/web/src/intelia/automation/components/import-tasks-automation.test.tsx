import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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

const radio = (name: string) => screen.getByRole("radio", { name });
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
    [JSON.stringify({ tasks: [{ title: "Imported", status: "to-do" }] })],
    "tasks.json",
    { type: "application/json" },
  );
  fireEvent.change(fileInput(), { target: { files: [file] } });
}

describe("ImportTasksDialog automation", () => {
  it("blocks the import, with the reason visible, until level and verification are chosen", () => {
    renderDialog();

    expect(radio("intelia:automation.levels.manual")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(radio("intelia:automation.yes")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(selectFileButton()).toBeDisabled();
    expect(screen.getByText("intelia:automation.required")).toBeInTheDocument();

    pickFile();
    expect(mocks.importTasks).not.toHaveBeenCalled();

    fireEvent.click(radio("intelia:automation.levels.arranque"));
    expect(selectFileButton()).toBeDisabled();
  });

  it("imports with the chosen level and verification for every task", async () => {
    mocks.importTasks.mockResolvedValue({
      results: { successful: 1, failed: 0 },
    });
    const onOpenChange = renderDialog();

    fireEvent.click(radio("intelia:automation.levels.arranque"));
    fireEvent.click(radio("intelia:automation.no"));
    chooseInitiative();
    expect(selectFileButton()).toBeEnabled();
    expect(
      screen.queryByText("intelia:automation.required"),
    ).not.toBeInTheDocument();

    pickFile();

    await waitFor(() =>
      expect(mocks.importTasks).toHaveBeenCalledWith({
        projectId: "project-1",
        tasks: [{ title: "Imported", status: "to-do" }],
        automation: { level: "arranque", verification: false },
        initiativeId: "init-import",
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
  it("never allows completa without verification", () => {
    renderDialog();

    fireEvent.click(radio("intelia:automation.no"));

    expect(radio("intelia:automation.levels.completa")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("keeps select file disabled until an initiative is chosen, and sends initiativeId", async () => {
    mocks.importTasks.mockResolvedValue({
      results: { successful: 1, failed: 0 },
    });
    renderDialog();

    fireEvent.click(radio("intelia:automation.levels.manual"));
    fireEvent.click(radio("intelia:automation.yes"));
    expect(selectFileButton()).toBeDisabled();

    chooseInitiative();
    expect(selectFileButton()).toBeEnabled();

    pickFile();
    await waitFor(() =>
      expect(mocks.importTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project-1",
          automation: { level: "manual", verification: true },
          initiativeId: "init-import",
        }),
      ),
    );
  });
});
