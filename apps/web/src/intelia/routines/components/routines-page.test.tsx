import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { RoutinesPage } from "./routines-page";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  canUpdateTasks: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { language: "en-US" },
  }),
}));
vi.mock("@/components/common/workspace-layout", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/page-title", () => ({ default: () => null }));
vi.mock("../i18n", () => ({}));
vi.mock("../api", () => ({
  useWorkspaceRoutines: () => ({
    data: [
      {
        id: "routine-1",
        taskId: "task-1",
        cron: "0 */2 * * *",
        timezone: "Europe/Madrid",
        active: true,
        ownerId: "user-1",
        ownerName: "Ana",
        nextRunAt: "2026-10-30T12:00:00.000Z",
        lastRunAt: null,
        lastResult: null,
        createdAt: "2026-10-30T09:00:00.000Z",
        updatedAt: "2026-10-30T09:00:00.000Z",
        task: {
          id: "task-1",
          number: 1,
          title: "Repaso",
          status: "done",
          projectId: "project-1",
          projectName: "Operaciones",
          projectSlug: "OPS",
          assigneeId: null,
          assigneeName: null,
        },
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useSaveRoutine: () => ({ mutate: mocks.save, isPending: false }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateTasks: mocks.canUpdateTasks }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/format", () => ({ formatDateTime: (value: string) => value }));

beforeEach(() => {
  mocks.canUpdateTasks.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RoutinesPage", () => {
  it("pauses a routine keeping its schedule", () => {
    render(<RoutinesPage workspaceId="workspace-1" />);

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

  it("disables the switch for a read-only user and never saves", () => {
    mocks.canUpdateTasks.mockReturnValue(false);
    render(<RoutinesPage workspaceId="workspace-1" />);

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(toggle);

    expect(mocks.save).not.toHaveBeenCalled();
  });
});
