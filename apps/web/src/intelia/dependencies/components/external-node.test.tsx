import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { type NodeProps, ReactFlowProvider } from "@xyflow/react";
import type { ExternalNodeData } from "../types";
import { ExternalNode } from "./external-node";

const m = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => m.navigate,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { task?: string; project?: string }) => {
      if (key === "intelia:dependencies.openExternal") {
        return `Open ${opts?.task} in ${opts?.project}`;
      }
      if (key === "intelia:dependencies.chainBadge") {
        return "Chain";
      }
      return key;
    },
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockData: ExternalNodeData = {
  id: "task-ext-1",
  number: 1,
  title: "External task 1",
  status: "In Progress",
  projectId: "proj-ext",
  projectSlug: "EXT",
  projectName: "Externo",
  isCompleted: false,
  isCritical: false,
  workspaceId: "ws-1",
};

const defaultProps = {
  id: "ext-1",
  data: mockData,
  selected: false,
  type: "externalTask",
  zIndex: 0,
  isConnectable: false,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  dragging: false,
  selectable: true,
  deletable: false,
  draggable: true,
} as unknown as NodeProps & { data: ExternalNodeData };

function renderNode(dataOverrides?: Partial<ExternalNodeData>) {
  const props = {
    ...defaultProps,
    data: {
      ...mockData,
      ...dataOverrides,
    },
  };
  return render(
    <ReactFlowProvider>
      <ExternalNode {...props} />
    </ReactFlowProvider>,
  );
}

describe("ExternalNode", () => {
  it("renders with accessible role link and name", () => {
    renderNode();

    const link = screen.getByRole("link", {
      name: "Open EXT-1 in Externo",
    });
    expect(link).toBeInTheDocument();
  });

  it("navigates to the board route on click", () => {
    renderNode();

    const link = screen.getByRole("link", {
      name: "Open EXT-1 in Externo",
    });
    fireEvent.click(link);

    expect(m.navigate).toHaveBeenCalledTimes(1);
    expect(m.navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
      params: {
        workspaceId: "ws-1",
        projectId: "proj-ext",
      },
      search: {
        taskId: "task-ext-1",
      },
    });
  });

  it("navigates to the board route on keyboard Enter and Space", () => {
    renderNode();

    const link = screen.getByRole("link", {
      name: "Open EXT-1 in Externo",
    });

    fireEvent.keyDown(link, { key: "Enter" });
    expect(m.navigate).toHaveBeenCalledTimes(1);
    expect(m.navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
      params: {
        workspaceId: "ws-1",
        projectId: "proj-ext",
      },
      search: {
        taskId: "task-ext-1",
      },
    });

    fireEvent.keyDown(link, { key: " " });
    expect(m.navigate).toHaveBeenCalledTimes(2);
  });

  it("renders with button role, calls onOpen on click/keyboard for same-project task", () => {
    const onOpen = vi.fn();
    renderNode({
      sameProject: true,
      scopeName: "Motor de flujo",
      onOpen,
    });

    const button = screen.getByRole("button", {
      name: "EXT-1 · External task 1",
    });
    expect(button).toBeInTheDocument();
    expect(screen.getByText("Motor de flujo")).toBeInTheDocument();

    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith("task-ext-1");
    expect(m.navigate).not.toHaveBeenCalled();

    fireEvent.keyDown(button, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("renders critical chain badge when isCritical is true", () => {
    renderNode({
      isCritical: true,
      criticalLabel: "Cadena pendiente más larga",
    });

    expect(screen.getByText("Chain")).toBeInTheDocument();
  });
});
