import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { PrioritiesPage } from "./priorities-page";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  canManageWorkspace: vi.fn(() => false),
}));

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
vi.mock("./priority-dialog", () => ({ PriorityDialog: () => null }));
vi.mock("./priority-history-dialog", () => ({
  PriorityHistoryDialog: () => null,
}));
vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canManageWorkspace: mocks.canManageWorkspace,
  }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));

const priority = (
  id: string,
  title: string,
  parentId: string | null,
  position: number,
  projects: { id: string; name: string; slug: string }[] = [],
) => ({
  id,
  workspaceId: "w1",
  parentId,
  title,
  body: "",
  position,
  status: "active",
  projects,
  createdByUserId: null,
  createdAt: "2026-11-09T10:00:00.000Z",
  updatedAt: "2026-11-09T10:00:00.000Z",
});

vi.mock("../api", () => ({
  useWorkspacePriorities: () => ({
    data: [
      priority("root", "Factory v1", null, 0),
      priority("b", "Intelia", "root", 1),
      priority("a", "Software Factory", "root", 0, [
        { id: "p1", name: "SF", slug: "SF" },
      ]),
      priority("lonely", "Sin enlaces", null, 1),
    ],
    isLoading: false,
    isError: false,
  }),
  useUpdatePriority: () => ({ mutate: mocks.mutate, isPending: false }),
}));

afterEach(() => {
  cleanup();
  mocks.mutate.mockReset();
});

describe("PrioritiesPage", () => {
  it("shows the whole tree, children nested in order, including unlinked ones", () => {
    render(<PrioritiesPage workspaceId="w1" />);
    const tree = screen.getByRole("list", { name: "intelia:priorities.title" });
    const items = [...tree.querySelectorAll("li")].map(
      (li) => li.querySelector("span")?.textContent,
    );
    expect(items).toEqual([
      "Factory v1",
      "Software Factory",
      "Intelia",
      "Sin enlaces",
    ]);
    expect(screen.getByText("SF")).toBeTruthy();
  });

  it("offers no change to someone who is not an administrator", () => {
    mocks.canManageWorkspace.mockReturnValue(false);
    render(<PrioritiesPage workspaceId="w1" />);
    expect(screen.queryByText("intelia:priorities.page.create")).toBeNull();
    expect(screen.queryByRole("button", { name: /moveUp/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /history/ })).toHaveLength(4);
  });

  it("lets an administrator reorder and close", () => {
    mocks.canManageWorkspace.mockReturnValue(true);
    render(<PrioritiesPage workspaceId="w1" />);
    fireEvent.click(
      screen.getByRole("button", {
        name: 'intelia:priorities.page.moveUp {"title":"Intelia"}',
      }),
    );
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      { priorityId: "b", input: { position: 0 } },
      expect.anything(),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: 'intelia:priorities.page.close {"title":"Sin enlaces"}',
      }),
    );
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      { priorityId: "lonely", input: { status: "closed" } },
      expect.anything(),
    );
  });
});
