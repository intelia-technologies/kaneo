import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { toast } from "@/lib/toast";
import { TaskAutomationPanel } from "./automation-panel";

const mocks = vi.hoisted(() => ({
  automation: vi.fn(),
  history: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { language: "en-US" },
  }),
}));
vi.mock("../i18n", () => ({}));
vi.mock("../api", () => ({
  useTaskAutomation: () => mocks.automation(),
  useTaskAutomationHistory: () => mocks.history(),
  useSetTaskAutomation: () => ({ mutate: mocks.mutate, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/format", () => ({ formatDateTime: (value: string) => value }));

const saved = {
  taskId: "task-1",
  level: "arranque",
  verification: true,
  source: "session",
  setByUserId: "user-1",
  setByName: "Ana",
  setByActor: null,
  setAt: "2026-10-30T09:00:00.000Z",
};

const radio = (name: string) => screen.getByRole("radio", { name });

beforeEach(() => {
  mocks.automation.mockReturnValue({ data: saved, isError: false });
  mocks.history.mockReturnValue({ data: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TaskAutomationPanel", () => {
  it("shows the level, verification, who set it and when", () => {
    render(<TaskAutomationPanel taskId="task-1" />);

    const badge = document.querySelector("[data-automation-level]");
    expect(badge?.getAttribute("data-automation-level")).toBe("arranque");
    expect(badge?.getAttribute("data-automation-verification")).toBe("true");
    expect(badge?.textContent).toContain("intelia:automation.levels.arranque");
    expect(badge?.textContent).toContain("intelia:automation.verified");
    expect(
      screen.getByText(
        `intelia:automation.setBy ${JSON.stringify({
          name: "Ana",
          date: saved.setAt,
        })}`,
      ),
    ).toBeTruthy();
  });

  it("falls back to the gateway actor when no person set the level", () => {
    mocks.automation.mockReturnValue({
      data: {
        ...saved,
        source: "gateway",
        setByUserId: null,
        setByName: null,
        setByActor: "agent:orq-pablo",
      },
      isError: false,
    });
    render(<TaskAutomationPanel taskId="task-1" />);

    expect(
      screen.getByText(
        `intelia:automation.setBy ${JSON.stringify({
          name: "agent:orq-pablo",
          date: saved.setAt,
        })}`,
      ),
    ).toBeTruthy();
  });

  it("says there is no level and leaves the selector empty and usable", () => {
    mocks.automation.mockReturnValue({ data: null, isError: false });
    render(<TaskAutomationPanel taskId="task-1" />);

    expect(screen.getByText("intelia:automation.noLevel")).toBeTruthy();
    expect(
      radio("intelia:automation.levels.manual").getAttribute("aria-checked"),
    ).toBe("false");

    fireEvent.click(radio("intelia:automation.levels.manual"));
    expect(mocks.mutate).not.toHaveBeenCalled();

    fireEvent.click(radio("intelia:automation.yes"));
    expect(mocks.mutate).toHaveBeenCalledWith(
      { taskId: "task-1", input: { level: "manual", verification: true } },
      expect.anything(),
    );
  });

  it("always shows the selector with the saved value and saves a new level", () => {
    render(<TaskAutomationPanel taskId="task-1" />);

    expect(
      radio("intelia:automation.levels.arranque").getAttribute("aria-checked"),
    ).toBe("true");
    expect(radio("intelia:automation.yes").getAttribute("aria-checked")).toBe(
      "true",
    );

    fireEvent.click(radio("intelia:automation.levels.completa"));

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate).toHaveBeenCalledWith(
      { taskId: "task-1", input: { level: "completa", verification: true } },
      expect.anything(),
    );
  });

  it("toasts the API message and goes back to the saved value on error", () => {
    mocks.mutate.mockImplementation(
      (_variables, options: { onError: (error: Error) => void }) =>
        options.onError(new Error("Forbidden")),
    );
    render(<TaskAutomationPanel taskId="task-1" />);

    fireEvent.click(radio("intelia:automation.levels.manual"));

    expect(toast.error).toHaveBeenCalledWith("Forbidden");
    expect(
      radio("intelia:automation.levels.arranque").getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      radio("intelia:automation.levels.manual").getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("lists the diary newest first with person, time and change", () => {
    mocks.history.mockReturnValue({
      data: [
        {
          id: "c2",
          taskId: "task-1",
          previousLevel: "manual",
          previousVerification: false,
          level: "arranque",
          verification: true,
          source: "session",
          changedByUserId: "user-1",
          changedByName: "Ana",
          changedByActor: null,
          changedAt: "2026-10-30T09:00:00.000Z",
        },
        {
          id: "c1",
          taskId: "task-1",
          previousLevel: null,
          previousVerification: null,
          level: "manual",
          verification: false,
          source: "gateway",
          changedByUserId: null,
          changedByName: null,
          changedByActor: "agent:orq-pablo",
          changedAt: "2026-10-29T08:00:00.000Z",
        },
      ],
    });
    render(<TaskAutomationPanel taskId="task-1" />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("2026-10-30T09:00:00.000Z");
    expect(rows[0].textContent).toContain("Ana");
    expect(rows[0].textContent).toContain("intelia:automation.change");
    expect(rows[0].textContent).toContain("intelia:automation.levels.manual");
    expect(rows[1].textContent).toContain("2026-10-29T08:00:00.000Z");
    expect(rows[1].textContent).toContain("agent:orq-pablo");
    expect(rows[1].textContent).toContain("intelia:automation.source.gateway");
    expect(rows[1].textContent).toContain("intelia:automation.firstSet");
  });

  it("says so when nothing has changed yet", () => {
    render(<TaskAutomationPanel taskId="task-1" />);

    expect(screen.getByText("intelia:automation.noHistory")).toBeTruthy();
  });
});
