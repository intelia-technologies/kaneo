import { useMemo, useState } from "react";
import { useCancelTaskWithDependents } from "./api";
import {
  MOTIVO_MAX,
  MOTIVO_MIN,
  type ErrorDependenciasSinResolver,
  type ResultadoCancelar,
} from "./contract/cancelar-con-dependientes";
import {
  evaluateDecisions,
  reconcileDecisions,
  type ChainDetails,
  type Decisions,
} from "./decisions";

export type UseCancelPanelOptions = {
  taskId: string;
  error: ErrorDependenciasSinResolver;
  onCancelled: (result: ResultadoCancelar) => void;
};

export function useCancelPanel({
  taskId,
  error,
  onCancelled,
}: UseCancelPanelOptions) {
  const [details, setDetails] = useState<ChainDetails>(error.details);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [targetTitles, setTargetTitles] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  // On the mutation, not on `mutate`: it still runs if the panel is closed
  // while the request is in flight.
  const mutation = useCancelTaskWithDependents(taskId, { onCancelled });

  const state = useMemo(
    () => evaluateDecisions(details, decisions),
    [details, decisions],
  );
  const reason = motivo.trim();
  const reasonOk = reason.length >= MOTIVO_MIN && reason.length <= MOTIVO_MAX;
  const canSubmit =
    reasonOk &&
    state.pendientes.length === 0 &&
    !details.truncada &&
    !mutation.isPending;

  const submit = () => {
    if (!canSubmit) return;
    mutation.mutate(
      { motivo: reason, resoluciones: state.resoluciones },
      {
        onSuccess: (outcome) => {
          if (outcome.status !== "unresolved") return;
          // The chain changed (or something was rejected): redraw with the
          // new one and keep what still holds, including any decision taken
          // while the request was in flight.
          const previous = details.cadena;
          const next = outcome.error.details;
          setDetails(next);
          setDecisions(
            (prev) => reconcileDecisions(prev, previous, next).decisions,
          );
          setChanged(reconcileDecisions({}, previous, next).changed);
          setSelected(null);
        },
      },
    );
  };

  const addTargetTitle = (ticket: string, title: string) =>
    setTargetTitles((prev) => new Map(prev).set(ticket, title));

  return {
    details,
    decisions,
    setDecisions,
    state,
    changed,
    selected,
    setSelected,
    motivo,
    setMotivo,
    reasonOk,
    canSubmit,
    submit,
    isSubmitting: mutation.isPending,
    submitError: mutation.error,
    targetTitles,
    addTargetTitle,
  };
}
