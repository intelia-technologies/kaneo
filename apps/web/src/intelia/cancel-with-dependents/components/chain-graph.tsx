import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type NodeTypes,
} from "@xyflow/react";
import type { ChainGraph as ChainGraphModel } from "../chain-graph-model";
import { ChainNode } from "./chain-node";

const nodeTypes: NodeTypes = { chainNode: ChainNode };

export function ChainGraph({
  graph,
  label,
  onPaneClick,
}: {
  graph: ChainGraphModel;
  label: string;
  onPaneClick: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="relative h-[440px] min-h-0 w-full overflow-hidden rounded-lg border bg-background"
    >
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onPaneClick={onPaneClick}
        fitView
        // Long chains (INFRA-381: 20 levels) would shrink to dots: open on the
        // root and its direct dependents, where deciding starts; the rest is
        // a pan or the zoom controls away.
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.5,
          nodes: graph.nodes
            .filter((n) => n.data.focus)
            .map(({ id }) => ({ id })),
        }}
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
