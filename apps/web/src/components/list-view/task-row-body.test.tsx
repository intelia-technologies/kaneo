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
import { CardFieldToggles } from "@/components/project/display/card-field-toggles";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type Task from "@/types/task";
import { TaskRowBody } from "./task-row-body";

// KF-23: the «Iniciativa» column of the list's rows.

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params: Record<string, string>;
    children: ReactNode;
  }) => (
    <a
      href={to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? "")}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

// The rest of the row is beside the point here.
vi.mock("@/components/custom-fields/use-task-card-fields", () => ({
  useTaskCardFields: () => [],
}));
vi.mock("@/components/custom-fields/card-field-list", () => ({
  CardFieldList: () => null,
}));
vi.mock("@/components/task-chips/subtasks-chip", () => ({
  SubtasksChip: () => null,
}));
vi.mock("@/components/task/task-recurrence-badge", () => ({
  TaskRecurrenceBadge: () => null,
}));
vi.mock("@/intelia/status-age/components/status-age-chip", () => ({
  StatusAgeChip: () => null,
}));

const fetchSpy = vi.fn();

beforeEach(() => {
  localStorage.clear();
  useUserPreferencesStore.setState({
    showAssignees: false,
    showPriority: false,
    showDueDates: false,
    showLabels: false,
    showTaskItemCounts: false,
    showInitiative: true,
  });
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchSpy.mockReset();
});

function task(fields: Partial<Task>): Task {
  return {
    id: "task-1",
    title: "Una tarea",
    number: 1,
    description: null,
    status: "to-do",
    priority: null,
    startDate: null,
    dueDate: null,
    position: 1,
    createdAt: "2026-11-17T00:00:00.000Z",
    userId: null,
    assigneeId: null,
    assigneeName: null,
    projectId: "project-kf",
    initiative: null,
    ...fields,
  };
}

function renderRow(rowTask: Task) {
  return render(
    <TaskRowBody
      task={rowTask}
      projectSlug="KF"
      workspaceId="workspace-1"
      isCompleted={false}
      assigneeName={null}
      assigneeImage={null}
      showPullRequests={false}
    />,
  );
}

describe("TaskRowBody «Iniciativa» column", () => {
  it.each(["to-do", "in-progress", "in-review", "done", "planned"])(
    "links a %s task's initiative to its panel",
    (status) => {
      renderRow(
        task({
          status,
          initiative: {
            id: "initiative-1",
            projectId: "project-kf",
            name: "Tableros",
          },
        }),
      );
      const link = screen.getByRole("link", { name: "Tableros" });
      expect(link.getAttribute("href")).toBe(
        "/dashboard/workspace/workspace-1/project/project-kf/initiatives/initiative-1",
      );
    },
  );

  it("shows «—» for a task without initiative", () => {
    const { container } = renderRow(task({ initiative: null }));
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.textContent).toContain("intelia:initiative.title: —");
  });

  it("names and links an initiative of another project to that project's panel", () => {
    renderRow(
      task({
        initiative: {
          id: "initiative-sf",
          projectId: "project-sf",
          name: "Factory versión 1",
        },
      }),
    );
    expect(
      screen
        .getByRole("link", { name: "Factory versión 1" })
        .getAttribute("href"),
    ).toBe(
      "/dashboard/workspace/workspace-1/project/project-sf/initiatives/initiative-sf",
    );
  });

  it("shows an initiative of a project the reader cannot read without name or link", () => {
    const { container } = renderRow(
      task({
        initiative: { id: "initiative-x", projectId: "project-x", name: null },
      }),
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.textContent).toContain(
      "intelia:initiative.otherProjectShort",
    );
  });

  it("hides from the display options and remembers the choice", () => {
    render(<CardFieldToggles layout="rows" />);
    const toggle = screen.getByRole("button", {
      name: "intelia:initiative.title",
    });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    cleanup();

    expect(
      JSON.parse(localStorage.getItem("user-preferences") ?? "{}").state
        ?.showInitiative,
    ).toBe(false);
    const { container } = renderRow(
      task({
        initiative: { id: "i", projectId: "project-kf", name: "Tableros" },
      }),
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.textContent).not.toContain("intelia:initiative.title");
    cleanup();

    useUserPreferencesStore.getState().resetDisplayPreferences();
    expect(useUserPreferencesStore.getState().showInitiative).toBe(true);
  });

  it("offers no initiative toggle for cards", () => {
    render(<CardFieldToggles layout="cards" />);
    expect(
      screen.queryByRole("button", { name: "intelia:initiative.title" }),
    ).toBeNull();
  });

  it("reads the initiative from the row's task, with no request of its own", () => {
    for (let i = 0; i < 150; i++) {
      renderRow(
        task({
          id: `task-${i}`,
          initiative: { id: "i", projectId: "project-kf", name: "Tableros" },
        }),
      );
    }
    expect(screen.getAllByRole("link")).toHaveLength(150);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
