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
import { toast } from "@/lib/toast";
import { TaskInitiativePanel } from "./initiative-panel";

const mocks = vi.hoisted(() => ({
  task: vi.fn(),
  initiative: vi.fn(),
  taskHistory: vi.fn(),
  initiativeHistory: vi.fn(),
  options: vi.fn(),
  setTaskInitiativeMutate: vi.fn(),
  closePlanMutate: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { language: "en-US" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("../i18n", () => ({}));

vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: () => mocks.task(),
}));

vi.mock("../api", () => ({
  useTaskInitiative: () => mocks.initiative(),
  useTaskInitiativeHistory: () => mocks.taskHistory(),
  useInitiativeHistory: (initiativeId: string | undefined) =>
    mocks.initiativeHistory(initiativeId),
  useInitiativeOptions: () => mocks.options(),
  useCreateInitiative: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSetTaskInitiative: () => ({
    mutate: mocks.setTaskInitiativeMutate,
    isPending: false,
  }),
  useClosePlan: () => ({
    mutate: mocks.closePlanMutate,
    isPending: false,
  }),
  useInvalidateInitiatives: () => vi.fn(),
}));

vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/format", () => ({ formatDateTime: (value: string) => value }));

const sampleTask = {
  id: "task-1",
  projectId: "proj-1",
  title: "A simple task",
};

const savedInitiative = {
  taskId: "task-1",
  initiativeId: "init-1",
  initiativeName: "Plan Maestro",
  initiativeReadable: true,
  origin: "plan" as const,
  since: "2026-10-30T09:00:00.000Z",
  setByUserId: "user-1",
  setByName: "Carlos",
  setByActor: null,
  source: "session" as const,
};

const project = {
  projectId: "proj-1",
  projectSlug: "SF",
  projectName: "Software Factory",
};

const sampleOptions = [
  { id: "init-1", name: "Plan Maestro", planClosedAt: null, ...project },
  { id: "init-2", name: "Fase Dos", planClosedAt: null, ...project },
];

beforeEach(() => {
  mocks.task.mockReturnValue({ data: sampleTask });
  mocks.initiative.mockReturnValue({ data: savedInitiative, isError: false });
  mocks.taskHistory.mockReturnValue({ data: [] });
  mocks.initiativeHistory.mockReturnValue({ data: [] });
  mocks.options.mockReturnValue({ data: sampleOptions, isLoading: false });
  mocks.setTaskInitiativeMutate.mockReset();
  mocks.closePlanMutate.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TaskInitiativePanel", () => {
  it("shows current initiative name, origin label, who and when", () => {
    render(<TaskInitiativePanel taskId="task-1" />);

    expect(screen.getAllByText("Plan Maestro").length).toBeGreaterThan(0);

    const badge = document.querySelector("[data-initiative-origin]");
    expect(badge?.getAttribute("data-initiative-origin")).toBe("plan");
    expect(badge?.textContent).toContain("intelia:initiative.origins.plan");

    expect(
      screen.getByText(
        `intelia:initiative.setBy ${JSON.stringify({
          name: "Carlos",
          date: savedInitiative.since,
        })}`,
      ),
    ).toBeTruthy();
  });

  it("task without initiative shows picker and says no initiative", () => {
    mocks.initiative.mockReturnValue({ data: null, isError: false });

    render(<TaskInitiativePanel taskId="task-1" />);

    expect(screen.getByText("intelia:initiative.noInitiative")).toBeTruthy();
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("panel changes initiative via PUT and shows history", async () => {
    mocks.taskHistory.mockReturnValue({
      data: [
        {
          id: "th-1",
          taskId: "task-1",
          previousInitiativeId: null,
          previousOrigin: null,
          initiativeId: "init-1",
          origin: "plan",
          source: "session",
          changedByUserId: "user-1",
          changedByName: "Carlos",
          changedByActor: null,
          changedAt: "2026-10-30T09:00:00.000Z",
        },
      ],
    });

    mocks.initiativeHistory.mockReturnValue({
      data: [
        {
          id: "ih-1",
          initiativeId: "init-1",
          kind: "created",
          previous: null,
          value: {},
          taskId: null,
          source: "session",
          changedByUserId: "user-1",
          changedByName: "Carlos",
          changedByActor: null,
          changedAt: "2026-10-29T09:00:00.000Z",
        },
      ],
    });

    render(<TaskInitiativePanel taskId="task-1" />);

    // Shows history items
    expect(screen.getByText("intelia:initiative.history")).toBeTruthy();
    expect(
      screen.getByText(
        `intelia:initiative.firstSet ${JSON.stringify({
          to: "Plan Maestro (intelia:initiative.origins.plan)",
        })}`,
      ),
    ).toBeTruthy();
    expect(screen.getByText("intelia:initiative.eventCreated")).toBeTruthy();

    // Change initiative via picker
    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);

    const option2 = await screen.findByRole("option", { name: "Fase Dos" });
    fireEvent.click(option2);

    expect(mocks.setTaskInitiativeMutate).toHaveBeenCalledWith(
      { taskId: "task-1", initiativeId: "init-2" },
      expect.anything(),
    );
  });

  it("reverts and shows toast on PUT error", async () => {
    mocks.setTaskInitiativeMutate.mockImplementation(
      (_vars: unknown, { onError }: { onError: (err: Error) => void }) => {
        onError(new Error("Network failed"));
      },
    );

    render(<TaskInitiativePanel taskId="task-1" />);

    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);

    const option2 = await screen.findByRole("option", { name: "Fase Dos" });
    fireEvent.click(option2);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Network failed");
    });
  });

  it("close-plan asks confirmation then POSTs", async () => {
    render(<TaskInitiativePanel taskId="task-1" />);

    const closePlanButton = screen.getByRole("button", {
      name: "intelia:initiative.closePlan",
    });
    fireEvent.click(closePlanButton);

    // Confirmation dialog opens
    expect(
      screen.getByText("intelia:initiative.closePlanConfirm.title"),
    ).toBeTruthy();
    expect(
      screen.getByText("intelia:initiative.closePlanConfirm.description"),
    ).toBeTruthy();

    const confirmButton = screen.getByRole("button", {
      name: "intelia:initiative.closePlanConfirm.confirm",
    });
    fireEvent.click(confirmButton);

    expect(mocks.closePlanMutate).toHaveBeenCalledWith(
      { initiativeId: "init-1" },
      expect.anything(),
    );
  });

  it("shows plan closed date when plan is already closed", () => {
    mocks.options.mockReturnValue({
      data: [
        {
          id: "init-1",
          name: "Plan Maestro",
          planClosedAt: "2026-10-31T12:00:00.000Z",
          ...project,
        },
      ],
      isLoading: false,
    });

    render(<TaskInitiativePanel taskId="task-1" />);

    expect(
      screen.queryByRole("button", { name: "intelia:initiative.closePlan" }),
    ).toBeNull();
    expect(
      screen.getByText(
        `intelia:initiative.planClosedOn ${JSON.stringify({
          date: "2026-10-31T12:00:00.000Z",
        })}`,
      ),
    ).toBeTruthy();
  });

  it("shows an initiative of a project the reader cannot see without its name, milestones or plan button", () => {
    mocks.initiative.mockReturnValue({
      data: {
        ...savedInitiative,
        initiativeId: "init-hidden",
        initiativeName: null,
        initiativeReadable: false,
      },
      isError: false,
    });

    render(<TaskInitiativePanel taskId="task-1" />);

    expect(
      screen.getAllByText("intelia:initiative.otherProject").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("intelia:initiative.closePlan")).toBeNull();
    expect(mocks.initiativeHistory).toHaveBeenCalledWith(undefined);
  });
});
