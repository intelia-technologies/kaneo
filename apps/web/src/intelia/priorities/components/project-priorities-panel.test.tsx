import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ProjectPrioritiesPanel } from "./project-priorities-panel";

const mocks = vi.hoisted(() => ({
  result: { data: undefined as unknown, isError: false },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/p">{children}</a>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));
vi.mock("../i18n", () => ({}));
vi.mock("../api", () => ({ useProjectPriorities: () => mocks.result }));

const ancestor = (id: string, title: string) => ({
  id,
  title,
  status: "active",
  updatedAt: "2026-11-09T10:00:00.000Z",
});

afterEach(cleanup);

describe("ProjectPrioritiesPanel", () => {
  it("shows each linked priority after its chain from the root", () => {
    mocks.result = {
      isError: false,
      data: [
        {
          id: "leaf",
          title: "Archivar tareas",
          body: "A las 24 horas",
          chain: [
            ancestor("root", "Factory v1"),
            ancestor("mid", "Software Factory"),
          ],
        },
      ],
    };
    render(<ProjectPrioritiesPanel projectId="p1" workspaceId="w1" />);

    const panel = screen.getByRole("region", {
      name: "intelia:priorities.panel.label",
    });
    expect(panel.textContent).toContain(
      "Factory v1 › Software Factory › Archivar tareas",
    );
    expect(screen.queryByText("A las 24 horas")).toBeNull();

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText("A las 24 horas")).toBeTruthy();
  });

  it("renders nothing for a project without priorities", () => {
    mocks.result = { isError: false, data: [] };
    const { container } = render(
      <ProjectPrioritiesPanel projectId="p1" workspaceId="w1" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("says so when they fail to load", () => {
    mocks.result = { isError: true, data: undefined };
    render(<ProjectPrioritiesPanel projectId="p1" workspaceId="w1" />);
    expect(screen.getByRole("alert").textContent).toBe(
      "intelia:priorities.panel.loadError",
    );
  });
});
