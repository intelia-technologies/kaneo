import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { ProjectWithTasks } from "@/types/project";
import { ColumnHeader } from "./column-header";
const m = vi.hoisted(() => ({
  project: undefined as ProjectWithTasks | undefined,
  archive: {} as {
    onConfirm?: () => void;
    disabled?: boolean;
    taskCount?: number;
  },
  mutate: vi.fn(),
  setProject: vi.fn(),
}));
vi.mock("@/intelia/archive/use-archive-tasks", () => ({
  useArchiveTasks: () => ({ mutate: m.mutate }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canUpdateTasks: () => true,
    canCreateTasks: () => true,
  }),
}));
vi.mock("@/store/project", () => ({
  default: () => ({ project: m.project, setProject: m.setProject }),
}));
vi.mock("@/components/shared/modals/create-task-modal", () => ({
  default: () => null,
}));
vi.mock("../../shared/modals/archive-tasks-modal", () => ({
  ArchiveTasksModal: (props: typeof m.archive) => {
    m.archive = props;
    return null;
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("prevents archive confirmation while the board is partial and uses the completed column afterward", () => {
  const column = {
    id: "done",
    name: "Done",
    slug: "done",
    isFinal: true,
    tasks: [{ id: "a" }],
  } as unknown as ProjectWithTasks["columns"][number];
  m.project = { id: "p", columns: [column] } as ProjectWithTasks;
  const { rerender } = render(<ColumnHeader column={column} />);
  fireEvent.click(screen.getByTitle(/archiveAllTooltip/));
  rerender(<ColumnHeader column={column} disableCollectionActions />);
  expect(screen.getByTitle(/archiveAllTooltip/).hasAttribute("disabled")).toBe(
    true,
  );
  expect(m.archive.disabled).toBe(true);
  act(() => m.archive.onConfirm?.());
  expect(m.mutate).not.toHaveBeenCalled();
  expect(m.setProject).not.toHaveBeenCalled();
  const complete = {
    ...column,
    tasks: [...column.tasks, { id: "b" }],
  } as typeof column;
  m.project = { ...m.project, columns: [complete] };
  rerender(<ColumnHeader column={complete} />);
  expect(m.archive.taskCount).toBe(2);
  act(() => m.archive.onConfirm?.());
  // One archive call with the whole column: the mark, not a status change.
  expect(m.mutate).toHaveBeenCalledOnce();
  expect(m.mutate.mock.calls[0]?.[0]).toEqual(["a", "b"]);
  expect(m.setProject).toHaveBeenCalledOnce();
});
it("offers «Add task» in an open column but never in «Pedida»", () => {
  const column = (slug: string) =>
    ({
      id: slug,
      name: slug,
      slug,
      isFinal: false,
      tasks: [],
    }) as unknown as ProjectWithTasks["columns"][number];
  m.project = {
    id: "p",
    columns: [column("pedida"), column("to-do")],
  } as ProjectWithTasks;
  const { rerender } = render(<ColumnHeader column={column("to-do")} />);
  expect(screen.queryByTitle(/addTask|Add task/)).not.toBeNull();
  rerender(<ColumnHeader column={column("pedida")} />);
  expect(screen.queryByTitle(/addTask|Add task/)).toBeNull();
});
