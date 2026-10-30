import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { GraphModelResult } from "../graph-model";
import { DependenciesView } from "./dependencies-view";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        "intelia:dependencies.loadError": "Failed to load dependencies",
        "intelia:dependencies.loadErrorDescription":
          "Could not retrieve task relations for this project.",
        "intelia:dependencies.retry": "Retry",
        "intelia:dependencies.loading": "Loading dependencies...",
        "intelia:dependencies.noTasks": "No tasks yet",
        "intelia:dependencies.noTasksDescription":
          "Create tasks in this project to see their dependency graph.",
        "intelia:dependencies.noTasksFound": "No tasks match your filters",
        "tasks:filterBar.noMatches": "Try adjusting or clearing your filters.",
        "intelia:dependencies.noDependencies": "No dependencies to show",
        "intelia:dependencies.noDependenciesDescription":
          'Visible tasks have no dependencies between them. Turn on "Show loose tasks" to view them all.',
        "intelia:dependencies.showLoose": "Show loose tasks",
      };
      return messages[key] ?? key;
    },
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const emptyModel: GraphModelResult = {
  nodes: [],
  edges: [],
  critical: {
    kind: "path",
    taskIds: [],
    edgeKeys: [],
  },
  hasCycle: false,
  cycleTaskNames: [],
  totalProjectTasks: 5,
  filteredProjectTasks: 3,
  visibleProjectTasks: 0,
  hasVisibleNodes: false,
};

describe("DependenciesView", () => {
  it("renders error panel with retry button on error and calls onRetry when clicked", () => {
    const onRetry = vi.fn();
    render(
      <DependenciesView
        model={emptyModel}
        showLoose={false}
        onToggleShowLoose={vi.fn()}
        isError={true}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Failed to load dependencies")).toBeInTheDocument();
    expect(
      screen.getByText("Could not retrieve task relations for this project."),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeInTheDocument();

    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders loading state when isLoading is true", () => {
    render(
      <DependenciesView
        model={emptyModel}
        showLoose={false}
        onToggleShowLoose={vi.fn()}
        isLoading={true}
      />,
    );

    expect(screen.getByText("Loading dependencies...")).toBeInTheDocument();
    expect(
      screen.queryByText("Failed to load dependencies"),
    ).not.toBeInTheDocument();
  });

  it("renders empty state offering show loose tasks when filteredProjectTasks > 0 but visibleProjectTasks is 0", () => {
    const onToggleShowLoose = vi.fn();
    render(
      <DependenciesView
        model={emptyModel}
        showLoose={false}
        onToggleShowLoose={onToggleShowLoose}
      />,
    );

    expect(screen.getByText("No dependencies to show")).toBeInTheDocument();
    const showLooseBtn = screen.getByRole("button", {
      name: "Show loose tasks",
    });
    expect(showLooseBtn).toBeInTheDocument();

    fireEvent.click(showLooseBtn);
    expect(onToggleShowLoose).toHaveBeenCalledTimes(1);
  });

  it("renders no tasks found when filteredProjectTasks is 0", () => {
    render(
      <DependenciesView
        model={{
          ...emptyModel,
          filteredProjectTasks: 0,
        }}
        showLoose={false}
        onToggleShowLoose={vi.fn()}
      />,
    );

    expect(screen.getByText("No tasks match your filters")).toBeInTheDocument();
  });
});
