import {
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
  automatica: true,
  pausaMotivo: null,
  entrega: "pr",
  source: "session",
  setByUserId: "user-1",
  setByName: "Ana",
  setByActor: null,
  setAt: "2026-10-30T09:00:00.000Z",
};

const GROUPS = {
  automatica: "intelia:automation.automatica",
  verification: "intelia:automation.verification",
  entrega: "intelia:automation.entrega",
};

const option = (group: keyof typeof GROUPS, name: string) =>
  within(screen.getByRole("radiogroup", { name: GROUPS[group] })).getByRole(
    "radio",
    { name },
  );
const yes = "intelia:automation.yes";
const no = "intelia:automation.no";
const pr = "intelia:automation.card.entrega.pr";
const sinPr = "intelia:automation.card.entrega.sin_pr";

const change = (overrides: Record<string, unknown>) => ({
  id: "c",
  taskId: "task-1",
  previousLevel: "arranque",
  previousVerification: true,
  previousAutomatica: true,
  level: "arranque",
  verification: true,
  automatica: true,
  pausaMotivo: null,
  entrega: "pr",
  source: "session",
  changedByUserId: "user-1",
  changedByName: "Ana",
  changedByActor: null,
  changedAt: "2026-10-30T09:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  mocks.automation.mockReturnValue({ data: saved, isError: false });
  mocks.history.mockReturnValue({ data: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TaskAutomationPanel", () => {
  it("shows automática, verification, delivery, who set it and when, and no level", () => {
    render(<TaskAutomationPanel taskId="task-1" />);

    const badge = document.querySelector("[data-automation-automatica]");
    expect(badge?.getAttribute("data-automation-automatica")).toBe("true");
    expect(badge?.getAttribute("data-automation-verification")).toBe("true");
    expect(badge?.getAttribute("data-automation-entrega")).toBe("pr");
    expect(badge?.textContent).toContain("intelia:automation.card.automatica");
    expect(badge?.textContent).toContain("intelia:automation.verified");
    expect(badge?.textContent).toContain(pr);
    expect(
      screen.getByText(
        `intelia:automation.setBy ${JSON.stringify({
          name: "Ana",
          date: saved.setAt,
        })}`,
      ),
    ).toBeTruthy();
    expect(screen.getAllByRole("radiogroup")).toHaveLength(3);
    expect(document.body.textContent).not.toMatch(/levels?\b|arranque/i);
  });

  it("shows a paused task with its reason", () => {
    mocks.automation.mockReturnValue({
      data: { ...saved, automatica: false, pausaMotivo: "movida_a_mano" },
      isError: false,
    });
    render(<TaskAutomationPanel taskId="task-1" />);

    const badge = document.querySelector("[data-automation-automatica]");
    expect(badge?.hasAttribute("data-automation-paused")).toBe(true);
    expect(badge?.textContent).toContain(
      `intelia:automation.card.paused ${JSON.stringify({ motivo: "movida_a_mano" })}`,
    );
    expect(
      screen.getByRole("textbox", { name: "intelia:automation.pauseReason" }),
    ).toHaveValue("movida_a_mano");
  });

  it("falls back to the gateway actor when no person set it", () => {
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

  it("says there is no automation and saves once automática and verification are chosen", () => {
    mocks.automation.mockReturnValue({ data: null, isError: false });
    render(<TaskAutomationPanel taskId="task-1" />);

    expect(screen.getByText("intelia:automation.none")).toBeTruthy();
    expect(option("automatica", yes)).toHaveAttribute("aria-checked", "false");

    fireEvent.click(option("automatica", yes));
    fireEvent.click(option("entrega", sinPr));
    expect(mocks.mutate).not.toHaveBeenCalled();

    fireEvent.click(option("verification", no));
    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        taskId: "task-1",
        input: {
          automatica: true,
          verification: false,
          entrega: "sin_pr",
          pausaMotivo: null,
        },
      },
      expect.anything(),
    );
  });

  it("shows the saved value and saves a change of delivery alone", () => {
    render(<TaskAutomationPanel taskId="task-1" />);

    expect(option("automatica", yes)).toHaveAttribute("aria-checked", "true");
    expect(option("verification", yes)).toHaveAttribute("aria-checked", "true");
    expect(option("entrega", pr)).toHaveAttribute("aria-checked", "true");

    fireEvent.click(option("entrega", pr));
    expect(mocks.mutate).not.toHaveBeenCalled();

    fireEvent.click(option("entrega", sinPr));
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        taskId: "task-1",
        input: {
          automatica: true,
          verification: true,
          entrega: "sin_pr",
          pausaMotivo: null,
        },
      },
      expect.anything(),
    );
  });

  it("turns automática off without a reason, then saves the optional reason", () => {
    const { rerender } = render(<TaskAutomationPanel taskId="task-1" />);
    expect(
      screen.queryByRole("textbox", { name: "intelia:automation.pauseReason" }),
    ).toBeNull();

    fireEvent.click(option("automatica", no));
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      {
        taskId: "task-1",
        input: {
          automatica: false,
          verification: true,
          entrega: "pr",
          pausaMotivo: null,
        },
      },
      expect.anything(),
    );

    mocks.automation.mockReturnValue({
      data: {
        ...saved,
        automatica: false,
        setAt: "2026-10-30T10:00:00.000Z",
      },
      isError: false,
    });
    rerender(<TaskAutomationPanel taskId="task-1" />);

    const reason = screen.getByRole("textbox", {
      name: "intelia:automation.pauseReason",
    });
    const saveReason = screen.getByRole("button", {
      name: "intelia:automation.savePauseReason",
    });
    expect(saveReason).toBeDisabled();
    fireEvent.change(reason, { target: { value: "  esperando a Jaime  " } });
    fireEvent.click(saveReason);

    expect(mocks.mutate).toHaveBeenLastCalledWith(
      {
        taskId: "task-1",
        input: {
          automatica: false,
          verification: true,
          entrega: "pr",
          pausaMotivo: "esperando a Jaime",
        },
      },
      expect.anything(),
    );
  });

  it("keeps the pause while automática stays off and drops it when turned on", () => {
    mocks.automation.mockReturnValue({
      data: { ...saved, automatica: false, pausaMotivo: "movida_a_mano" },
      isError: false,
    });
    render(<TaskAutomationPanel taskId="task-1" />);

    fireEvent.click(option("verification", no));
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      {
        taskId: "task-1",
        input: {
          automatica: false,
          verification: false,
          entrega: "pr",
          pausaMotivo: "movida_a_mano",
        },
      },
      expect.anything(),
    );

    fireEvent.click(option("automatica", yes));
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      {
        taskId: "task-1",
        input: {
          automatica: true,
          verification: false,
          entrega: "pr",
          pausaMotivo: null,
        },
      },
      expect.anything(),
    );
  });

  it("clears the reason when saved empty", () => {
    mocks.automation.mockReturnValue({
      data: { ...saved, automatica: false, pausaMotivo: "movida_a_mano" },
      isError: false,
    });
    render(<TaskAutomationPanel taskId="task-1" />);

    fireEvent.change(
      screen.getByRole("textbox", { name: "intelia:automation.pauseReason" }),
      { target: { value: "   " } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "intelia:automation.savePauseReason",
      }),
    );

    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        taskId: "task-1",
        input: {
          automatica: false,
          verification: true,
          entrega: "pr",
          pausaMotivo: null,
        },
      },
      expect.anything(),
    );
  });

  it("toasts the API message and goes back to the saved value on error", () => {
    mocks.mutate.mockImplementation(
      (_variables, options: { onError: (error: Error) => void }) =>
        options.onError(new Error("Forbidden")),
    );
    render(<TaskAutomationPanel taskId="task-1" />);

    fireEvent.click(option("automatica", no));

    expect(toast.error).toHaveBeenCalledWith("Forbidden");
    expect(option("automatica", yes)).toHaveAttribute("aria-checked", "true");
    expect(option("automatica", no)).toHaveAttribute("aria-checked", "false");
  });

  it("lists the diary newest first with the before and after of each change", () => {
    mocks.history.mockReturnValue({
      data: [
        // Delivery alone: the before comes from the row before it.
        change({
          id: "c3",
          entrega: "sin_pr",
          changedAt: "2026-10-31T09:00:00.000Z",
        }),
        // Automática alone.
        change({
          id: "c2",
          previousAutomatica: false,
          changedAt: "2026-10-30T09:00:00.000Z",
        }),
        change({
          id: "c1",
          previousLevel: null,
          previousVerification: null,
          previousAutomatica: null,
          automatica: false,
          level: "manual",
          source: "gateway",
          changedByUserId: null,
          changedByName: null,
          changedByActor: "agent:orq-pablo",
          changedAt: "2026-10-29T08:00:00.000Z",
        }),
      ],
    });
    render(<TaskAutomationPanel taskId="task-1" />);

    const describe = (automatica: string, entrega: string) =>
      `${automatica} · intelia:automation.verified · ${entrega}`;
    const automatic = "intelia:automation.card.automatica";
    const manual = "intelia:automation.card.manual";
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("2026-10-31T09:00:00.000Z");
    expect(rows[0].textContent).toContain(
      `intelia:automation.change ${JSON.stringify({
        from: describe(automatic, pr),
        to: describe(automatic, sinPr),
      })}`,
    );
    expect(rows[1].textContent).toContain("Ana");
    expect(rows[1].textContent).toContain(
      `intelia:automation.change ${JSON.stringify({
        from: describe(manual, pr),
        to: describe(automatic, pr),
      })}`,
    );
    expect(rows[2].textContent).toContain("2026-10-29T08:00:00.000Z");
    expect(rows[2].textContent).toContain("agent:orq-pablo");
    expect(rows[2].textContent).toContain("intelia:automation.source.gateway");
    expect(rows[2].textContent).toContain(
      `intelia:automation.firstSet ${JSON.stringify({ to: describe(manual, pr) })}`,
    );
  });

  it("shows a change of pause reason with the reason before and after", () => {
    mocks.history.mockReturnValue({
      data: [
        change({
          id: "c2",
          previousAutomatica: false,
          automatica: false,
          pausaMotivo: "b",
        }),
        change({ id: "c1", automatica: false, pausaMotivo: "a" }),
      ],
    });
    render(<TaskAutomationPanel taskId="task-1" />);

    const describe = (motivo: string) =>
      `intelia:automation.card.paused ${JSON.stringify({ motivo })} · intelia:automation.verified · ${pr}`;
    expect(screen.getAllByRole("listitem")[0].textContent).toContain(
      `intelia:automation.change ${JSON.stringify({
        from: describe("a"),
        to: describe("b"),
      })}`,
    );
  });

  it("says so when nothing has changed yet", () => {
    render(<TaskAutomationPanel taskId="task-1" />);

    expect(screen.getByText("intelia:automation.noHistory")).toBeTruthy();
  });
});
