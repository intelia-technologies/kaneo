import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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
import { useDuplicateAutomationStore } from "../duplicate-store";
import { DuplicateAutomationDialog } from "./duplicate-automation-dialog";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));

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
      onClick={() => onChange("init-copy")}
    >
      Pick initiative
    </button>
  ),
}));
vi.mock("@/hooks/mutations/task/use-duplicate-task", () => ({
  useDuplicateTask: () => ({ mutate: mocks.mutate, isPending: false }),
}));

const request = { taskId: "task-1", title: "Copy of task" };
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
const confirmButton = () =>
  screen.getByRole("button", { name: "intelia:automation.duplicate.confirm" });

beforeEach(() => {
  useDuplicateAutomationStore.getState().close();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DuplicateAutomationDialog", () => {
  it("renders nothing while no duplicate waits for its automation", () => {
    render(<DuplicateAutomationDialog />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("blocks the duplicate, with the reason visible, until the automation is chosen", () => {
    render(<DuplicateAutomationDialog />);
    act(() => useDuplicateAutomationStore.getState().ask(request));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(option("automatica", "no")).toHaveAttribute("aria-checked", "false");
    expect(option("verification", "yes")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByText("intelia:automation.required")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();

    fireEvent.click(confirmButton());
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("duplicates with the chosen automática, verification and delivery", () => {
    render(<DuplicateAutomationDialog />);
    act(() => useDuplicateAutomationStore.getState().ask(request));

    chooseAutomation("yes", "no", "sin_pr");
    fireEvent.click(confirmButton());

    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        ...request,
        automation: {
          automatica: true,
          verification: false,
          entrega: "sin_pr",
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("closes once the duplicate succeeded", () => {
    mocks.mutate.mockImplementation((_variables, options) =>
      options.onSuccess(),
    );
    render(<DuplicateAutomationDialog />);
    act(() => useDuplicateAutomationStore.getState().ask(request));

    chooseAutomation("no", "yes", "pr");
    fireEvent.click(confirmButton());

    expect(useDuplicateAutomationStore.getState().request).toBeNull();
  });

  it("asks for an initiative when only the initiative is missing and sends initiativeId", () => {
    render(<DuplicateAutomationDialog />);
    act(() =>
      useDuplicateAutomationStore.getState().ask({
        taskId: "task-1",
        projectId: "proj-1",
        title: "Copy of task",
        missingAutomation: false,
        missingInitiative: true,
      }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByTestId("mock-initiative-picker")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();

    fireEvent.click(screen.getByTestId("mock-initiative-picker"));
    expect(confirmButton()).toBeEnabled();
    fireEvent.click(confirmButton());

    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-1",
        title: "Copy of task",
        initiativeId: "init-copy",
      }),
      expect.anything(),
    );
  });
});
