import "@xyflow/react/dist/style.css";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
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
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
};

const nodeTypes: NodeTypes = {
  projectTask: TaskNode,
  externalTask: ExternalNode,
};

export function DependenciesView({
  model,
  showLoose,
  onToggleShowLoose,
  isLoading,
  isError,
  onRetry,
}: DependenciesViewProps) {
  const { t } = useTranslation();
  const [nodes, setNodes, onNodesChange] = useNodesState(model.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(model.edges);

  useEffect(() => {
    setNodes(model.nodes);
    setEdges(model.edges);
  }, [model.nodes, model.edges, setNodes, setEdges]);

  if (isError) {
    return (
      <div className="relative flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center p-6 text-center overflow-hidden bg-background">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-6" />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-foreground">
          {t("intelia:dependencies.loadError")}
        </h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {t("intelia:dependencies.loadErrorDescription")}
        </p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={onRetry}
          >
            {t("intelia:dependencies.retry")}
          </Button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="relative flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center p-6 text-center overflow-hidden bg-background">
        <Spinner className="size-6 text-muted-foreground" />
        <p className="mt-3 text-xs text-muted-foreground">
          {t("intelia:dependencies.loading")}
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-background">
      {model.hasCycle && <CycleWarning taskNames={model.cycleTaskNames} />}

      {!model.hasVisibleNodes ? (
        <EmptyState
          totalTasks={model.totalProjectTasks}
          filteredTasksCount={model.filteredProjectTasks}
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
            fitView
            fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={1.5}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
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
