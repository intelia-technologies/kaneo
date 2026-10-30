import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type * as ScheduleModule from "../schedule";
import { TaskRoutinePanel } from "./routine-panel";

const mocks = vi.hoisted(() => ({
  routine: vi.fn(),
  runs: vi.fn(),
  task: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  canUpdateTasks: vi.fn(),
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
  useTaskRoutine: () => mocks.routine(),
  useRoutineRuns: () => mocks.runs(),
  useSaveRoutine: () => ({ mutate: mocks.save, isPending: false }),
  useDeleteRoutine: () => ({ mutate: mocks.remove, isPending: false }),
}));
vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: () => mocks.task(),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateTasks: mocks.canUpdateTasks }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/format", () => ({ formatDateTime: (value: string) => value }));
vi.mock("../schedule", async (importOriginal) => ({
  ...(await importOriginal<typeof ScheduleModule>()),
  browserTimezone: () => "Europe/Madrid",
}));

const routine = {
  id: "routine-1",
  taskId: "task-1",
  cron: "0 */2 * * *",
  timezone: "Europe/Madrid",
  active: true,
  ownerId: "user-1",
  ownerName: "Ana",
  nextRunAt: "2026-10-30T12:00:00.000Z",
  lastRunAt: "2026-10-30T10:00:00.000Z",
  lastResult: "reabierta",
  createdAt: "2026-10-30T09:00:00.000Z",
  updatedAt: "2026-10-30T09:00:00.000Z",
};

beforeEach(() => {
  mocks.routine.mockReturnValue({ data: null, isLoading: false });
  mocks.runs.mockReturnValue({ data: [] });
  mocks.task.mockReturnValue({ data: { id: "task-1", recurrence: null } });
  mocks.canUpdateTasks.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TaskRoutinePanel", () => {
  it("schedules every 2 hours in the browser's time zone", () => {
    render(<TaskRoutinePanel taskId="task-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "intelia:routines.panel.schedule" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "intelia:routines.panel.save" }),
    );

    expect(mocks.save).toHaveBeenCalledWith(
      {
        taskId: "task-1",
        input: {
          cron: "0 */2 * * *",
          timezone: "Europe/Madrid",
          active: true,
        },
      },
      expect.anything(),
    );
  });

  it("shows the schedule, the next run and the recent runs", () => {
    mocks.routine.mockReturnValue({ data: routine, isLoading: false });
    mocks.runs.mockReturnValue({
      data: [
        {
          id: "run-1",
          routineId: "routine-1",
          scheduledAt: "2026-10-30T10:00:00.000Z",
          result: "saltada_abierta",
          error: null,
          closedAt: null,
          createdAt: "2026-10-30T10:00:01.000Z",
        },
      ],
    });
    render(<TaskRoutinePanel taskId="task-1" />);

    expect(
      screen.getByText('intelia:routines.describe.everyHours {"count":2}'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^intelia:routines\.panel\.next \{"date":".+"\}/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("intelia:routines.result.saltada_abierta"),
    ).toBeInTheDocument();
  });

  it("pauses the routine keeping its schedule", () => {
    mocks.routine.mockReturnValue({ data: routine, isLoading: false });
    render(<TaskRoutinePanel taskId="task-1" />);

    fireEvent.click(screen.getByRole("switch"));

    expect(mocks.save).toHaveBeenCalledWith(
      {
        taskId: "task-1",
        input: {
          cron: "0 */2 * * *",
          timezone: "Europe/Madrid",
          active: false,
        },
      },
      expect.anything(),
    );
  });

  it("offers no write control to a read-only user", () => {
    mocks.canUpdateTasks.mockReturnValue(false);
    mocks.routine.mockReturnValue({ data: routine, isLoading: false });
    render(<TaskRoutinePanel taskId="task-1" />);

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(toggle);
    expect(
      screen.queryByRole("button", { name: "intelia:routines.panel.edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "intelia:routines.panel.remove" }),
    ).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("does not offer a routine on a task with upstream recurrence", () => {
    mocks.task.mockReturnValue({
      data: {
        id: "task-1",
        recurrence: { frequency: "daily", interval: 1, timeZone: "UTC" },
      },
    });
    render(<TaskRoutinePanel taskId="task-1" />);

    expect(
      screen.queryByRole("button", { name: "intelia:routines.panel.schedule" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("intelia:routines.panel.hasRecurrence"),
    ).toBeInTheDocument();
  });
});
