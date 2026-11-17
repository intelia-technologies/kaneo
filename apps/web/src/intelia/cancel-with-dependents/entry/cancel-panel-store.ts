import { create } from "zustand";
import type { ErrorDependenciasSinResolver } from "../contract/cancelar-con-dependientes";
import { dependenciesErrorOf } from "./dependencies-error";

export type CancelPanelRequest = {
  /** Kaneo id of the root, for `POST /intelia/task/{id}/cancel`. */
  taskId: string;
  error: ErrorDependenciasSinResolver;
};

// Panel D waits here for the path that got the 409: the menu, popover or
// dialog that asked for it closes as soon as it is used, so the panel lives
// in a host mounted once in the authenticated layout.
export const useCancelPanelStore = create<{
  request: CancelPanelRequest | null;
  close: () => void;
}>((set) => ({
  request: null,
  close: () => set({ request: null }),
}));

/** The root's Kaneo id: the task itself, or looked up by its key in a batch. */
export type CancelRoot = string | ((ticket: string) => string | undefined);

/**
 * Opens panel D when `error` is the `409 DEPENDENCIAS_SIN_RESOLVER` of a path
 * that cancels (design 82 §4.9), for the root it names. False for any other
 * error, or a root that cannot be found, so the caller reports it as before.
 */
export function openCancelPanel(error: unknown, root: CancelRoot): boolean {
  const unresolved = dependenciesErrorOf(error);
  if (!unresolved) return false;
  const taskId =
    typeof root === "string" ? root : root(unresolved.details.tarea.ticket);
  if (!taskId) return false;
  useCancelPanelStore.setState({ request: { taskId, error: unresolved } });
  return true;
}
