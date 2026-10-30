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

function renderNode() {
  return render(
    <ReactFlowProvider>
      <ExternalNode {...defaultProps} />
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
});
