import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { GraphModelResult } from "../graph-model";
import { InitiativeTree } from "./initiative-tree";

const mockGraphModel: GraphModelResult = {
  nodes: [],
  edges: [],
  critical: { kind: "path", taskIds: [], edgeKeys: [] },
  hasCycle: false,
  cycleTaskNames: [],
  totalProjectTasks: 3,
  filteredProjectTasks: 3,
  visibleProjectTasks: 2,
  hasVisibleNodes: false,
};

vi.mock("../use-dependencies-graph", () => ({
  useDependenciesGraph: () => ({
    project: { id: "proj-1", slug: "DEMO", name: "Demo", columns: [] },
    relationsData: { relations: [], externalTasks: [] },
    graphModel: mockGraphModel,
    initiativeNames: new Map([["init-1", "Iniciativa 1"]]),
    projectInitiatives: [],
    selectedInitiative: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
  }: {
    children: React.ReactNode;
    to: string;
    search?: { initiativeId?: string };
  }) => (
    <a href={`${to}?initiativeId=${search?.initiativeId ?? ""}`}>{children}</a>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        "intelia:dependencies.showCancelled": "Mostrar canceladas",
        "intelia:dependencies.openInDependencies": "Abrir en Dependencias",
        "intelia:dependencies.noTasks": "No hay tareas",
        "intelia:dependencies.noTasksDescription":
          "Crea tareas en el proyecto para ver su grafo de dependencias.",
      };
      return messages[key] ?? key;
    },
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InitiativeTree", () => {
  it("renders show cancelled toggle and calls onShowCancelledChange when clicked", () => {
    const onShowCancelledChange = vi.fn();
    const onOpenTask = vi.fn();

    render(
      <InitiativeTree
        projectId="proj-1"
        workspaceId="ws-1"
        initiativeId="init-1"
        showCancelled={false}
        onShowCancelledChange={onShowCancelledChange}
        onOpenTask={onOpenTask}
      />,
    );

    const toggle = screen.getByRole("switch");
    expect(toggle).toBeInTheDocument();
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    expect(onShowCancelledChange).toHaveBeenCalledWith(true);
  });

  it("renders link to open in dependencies with initiativeId search param", () => {
    render(
      <InitiativeTree
        projectId="proj-1"
        workspaceId="ws-1"
        initiativeId="init-1"
        showCancelled={true}
        onShowCancelledChange={vi.fn()}
        onOpenTask={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", {
      name: /Abrir en Dependencias/i,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/workspace/$workspaceId/project/$projectId/dependencies?initiativeId=init-1",
    );
  });
});
