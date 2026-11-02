import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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
vi.mock("@/hooks/mutations/task/use-duplicate-task", () => ({
  useDuplicateTask: () => ({ mutate: mocks.mutate, isPending: false }),
}));

const request = { taskId: "task-1", title: "Copy of task" };
const radio = (name: string) => screen.getByRole("radio", { name });
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
  it("renders nothing while no duplicate waits for a level", () => {
    render(<DuplicateAutomationDialog />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("blocks the duplicate, with the reason visible, until a level is chosen", () => {
    render(<DuplicateAutomationDialog />);
    act(() => useDuplicateAutomationStore.getState().ask(request));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(radio("intelia:automation.levels.manual")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(radio("intelia:automation.yes")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByText("intelia:automation.required")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();

    fireEvent.click(confirmButton());
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("duplicates with the chosen level and verification", () => {
    render(<DuplicateAutomationDialog />);
    act(() => useDuplicateAutomationStore.getState().ask(request));

    fireEvent.click(radio("intelia:automation.levels.arranque"));
    fireEvent.click(radio("intelia:automation.no"));
    fireEvent.click(confirmButton());

    expect(mocks.mutate).toHaveBeenCalledWith(
      { ...request, automation: { level: "arranque", verification: false } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("never offers completa without verification", () => {
    render(<DuplicateAutomationDialog />);
    act(() => useDuplicateAutomationStore.getState().ask(request));

    fireEvent.click(radio("intelia:automation.no"));

    expect(radio("intelia:automation.levels.completa")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("closes once the duplicate succeeded", () => {
    mocks.mutate.mockImplementation((_variables, options) =>
      options.onSuccess(),
    );
    render(<DuplicateAutomationDialog />);
    act(() => useDuplicateAutomationStore.getState().ask(request));

    fireEvent.click(radio("intelia:automation.levels.manual"));
    fireEvent.click(radio("intelia:automation.yes"));
    fireEvent.click(confirmButton());

    expect(useDuplicateAutomationStore.getState().request).toBeNull();
  });
});
