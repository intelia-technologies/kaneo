import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";
import { buildChainGraph } from "../chain-graph-model";
import {
  MOTIVO_MAX,
  MOTIVO_MIN,
  type ErrorDependenciasSinResolver,
  type ResultadoCancelar,
} from "../contract/cancelar-con-dependientes";
import {
  branchOf,
  cancelAll,
  cancelBranch,
  isDecidir,
  releaseAll,
  withDecision,
} from "../decisions";
import { useCancelPanel } from "../use-cancel-panel";
import { ChainGraph } from "./chain-graph";
import { DecisionToolbar } from "./decision-toolbar";
import { EffectsSummary } from "./effects-summary";
import { GraphLegend } from "./graph-legend";
import { NodeMenu, type NodeMenuAction } from "./node-menu";
import { OtherBoardsNotice } from "./other-boards-notice";
import { PanelFooter } from "./panel-footer";
import { ServerProblems } from "./server-problems";
import "../i18n";

export function CancelPanelBody({
  error,
  taskId,
  workspaceId,
  onCancelled,
}: {
  error: ErrorDependenciasSinResolver;
  taskId: string;
  workspaceId: string;
  onCancelled: (result: ResultadoCancelar) => void;
}) {
  const { t } = useTranslation();
  const p = "intelia:cancelWithDependents";
  const reasonId = useId();
  const panel = useCancelPanel({ taskId, error, onCancelled });
  const { details, decisions, setDecisions, state, selected, setSelected } =
    panel;

  const graph = useMemo(
    () =>
      buildChainGraph({
        details,
        decisions,
        state,
        selected,
        changed: panel.changed,
        targetTitles: panel.targetTitles,
        onSelect: setSelected,
      }),
    [
      details,
      decisions,
      state,
      selected,
      panel.changed,
      panel.targetTitles,
      setSelected,
    ],
  );

  const selectedNode = details.cadena
    .filter(isDecidir)
    .find((n) => n.ticket === selected);
  const moveExcluded = useMemo(
    () =>
      new Set([
        ...state.canceladas,
        ...(selectedNode ? [selectedNode.ticket] : []),
      ]),
    [state.canceladas, selectedNode],
  );

  const onAction = (action: NodeMenuAction) => {
    if (!selectedNode) return;
    const ticket = selectedNode.ticket;
    if (action.type === "cancelarRama") {
      setDecisions(cancelBranch(decisions, details.cadena, ticket));
    } else if (action.type === "mover") {
      panel.addTargetTitle(action.a, action.title);
      setDecisions(
        withDecision(decisions, ticket, { accion: "mover", a: action.a }),
      );
    } else {
      setDecisions(withDecision(decisions, ticket, { accion: action.type }));
    }
    setSelected(null);
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={reasonId} className="font-medium text-sm">
            {t(`${p}.reason`)}
          </label>
          <Textarea
            id={reasonId}
            required
            maxLength={MOTIVO_MAX}
            value={panel.motivo}
            placeholder={t(`${p}.reasonPlaceholder`)}
            onChange={(e) => panel.setMotivo(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {t(`${p}.reasonHelp`, { min: MOTIVO_MIN })}
          </p>
        </div>

        <DecisionToolbar
          state={state}
          onCancelAll={() => setDecisions(cancelAll(details.cadena))}
          onReleaseAll={() =>
            setDecisions(releaseAll(decisions, details.cadena))
          }
        />

        {details.truncada && (
          <p role="alert" className="text-destructive text-sm">
            {t(`${p}.truncated`, {
              total: details.total,
              shown: details.cadena.length,
            })}
          </p>
        )}
        <ServerProblems problemas={details.problemas} />

        <ChainGraph
          graph={graph}
          label={t(`${p}.graphLabel`, { ticket: details.tarea.ticket })}
          onPaneClick={() => setSelected(null)}
        />
        <GraphLegend />

        {selectedNode && (
          <NodeMenu
            key={selectedNode.ticket}
            node={selectedNode}
            hasBranch={branchOf(details.cadena, selectedNode.ticket).length > 1}
            workspaceId={workspaceId}
            moveExcluded={moveExcluded}
            onAction={onAction}
            onClose={() => setSelected(null)}
          />
        )}

        <OtherBoardsNotice effects={state.efectos.otros_tableros} />
        <EffectsSummary state={state} />
        {panel.submitError && (
          <p role="alert" className="text-destructive text-sm">
            {t(`${p}.error`, { message: panel.submitError.message })}
          </p>
        )}
      </div>
      <PanelFooter
        pending={state.pendientes.length}
        reasonOk={panel.reasonOk}
        cancelCount={state.canceladas.size}
        canSubmit={panel.canSubmit}
        isSubmitting={panel.isSubmitting}
        onSubmit={panel.submit}
      />
    </>
  );
}
