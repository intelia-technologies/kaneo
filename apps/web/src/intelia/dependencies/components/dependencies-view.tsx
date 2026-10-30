import "@xyflow/react/dist/style.css";
import { useCallback, useEffect } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import type { GraphModelResult } from "../graph-model";
import { CycleWarning } from "./cycle-warning";
import { EmptyState } from "./empty-state";
import { ExternalNode } from "./external-node";
import { TaskNode } from "./task-node";

type DependenciesViewProps = {
  model: GraphModelResult;
  showLoose: boolean;
  onToggleShowLoose: () => void;
  onOpenTask: (taskId: string) => void;
};

const nodeTypes: NodeTypes = {
  projectTask: TaskNode,
  externalTask: ExternalNode,
};

export function DependenciesView({
  model,
  showLoose,
  onToggleShowLoose,
  onOpenTask,
}: DependenciesViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(model.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(model.edges);

  useEffect(() => {
    setNodes(model.nodes);
    setEdges(model.edges);
  }, [model.nodes, model.edges, setNodes, setEdges]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (node.type === "projectTask") {
        onOpenTask(node.id);
      }
    },
    [onOpenTask],
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-background">
      {model.hasCycle && <CycleWarning taskNames={model.cycleTaskNames} />}

      {!model.hasVisibleNodes ? (
        <EmptyState
          totalTasks={model.totalProjectTasks}
          filteredTasksCount={model.visibleProjectTasks}
          showLoose={showLoose}
          onToggleShowLoose={onToggleShowLoose}
        />
      ) : (
        <div className="relative h-full w-full min-h-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={1.5}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="var(--color-border, #cbd5e1)"
            />
            <Controls
              showInteractive={false}
              className="!border-border !bg-background !shadow-xs [&>button]:!border-border [&>button]:!bg-background [&>button]:!text-foreground hover:[&>button]:!bg-accent"
            />
          </ReactFlow>
        </div>
      )}
    </div>
  );
}
