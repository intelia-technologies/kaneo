import type { QueryClient } from "@tanstack/react-query";
import { INITIATIVE_QUERY_ROOT, projectInitiativesRootKey } from "./api";

// Design 19 §6: the events of 5 seconds become a single reload of the
// listing and the open detail, with no polling. The window starts with the
// first event, so a steady stream still refreshes every 5 seconds.
export const INITIATIVES_BURST_MS = 5000;

// Every task event can change a counter, an origin or a dependency.
const INITIATIVE_EVENTS: Record<string, true> = {
  TASK_CREATED: true,
  TASK_UPDATED: true,
  TASK_DELETED: true,
  TASK_MOVED: true,
  TASK_RELATION_UPDATED: true,
};

// History keys carry no project (they are shared with IN-05's task block),
// so the whole prefix goes; only the histories on screen refetch.
const HISTORY_PREFIX = [INITIATIVE_QUERY_ROOT, "initiative-history"] as const;

const pendingRefresh = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Reloads the project's initiative reads now: the listing, any open detail
 * and the initiative histories (a task reaching In progress closes the plan
 * and writes `plan_closed`). Only active queries refetch (React Query's
 * default), so a project whose initiatives are not on screen costs nothing.
 */
export function invalidateProjectInitiatives(
  queryClient: QueryClient,
  projectId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: projectInitiativesRootKey(projectId),
  });
  void queryClient.invalidateQueries({ queryKey: HISTORY_PREFIX });
}

/** Called by the project WebSocket (`useProjectWebSocket`) for each message. */
export function refreshInitiatives(
  queryClient: QueryClient,
  projectId: string,
  eventType: unknown,
) {
  if (
    typeof eventType !== "string" ||
    !Object.hasOwn(INITIATIVE_EVENTS, eventType)
  )
    return;
  if (pendingRefresh.has(projectId)) return;
  pendingRefresh.set(
    projectId,
    setTimeout(() => {
      pendingRefresh.delete(projectId);
      invalidateProjectInitiatives(queryClient, projectId);
    }, INITIATIVES_BURST_MS),
  );
}

/**
 * A task field edited in Kaneo's task sheet (for example `motivo_bloqueo`
 * or `motivo_bloqueo_detalle`) feeds the initiatives' aggregates and may
 * not raise a task event: reload any initiative read on screen at once.
 */
export function invalidateInitiativesAfterTaskEdit(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    queryKey: [INITIATIVE_QUERY_ROOT, "project"],
  });
}

/** Drops a pending grouped reload, when the project's socket goes away. */
export function cancelInitiativesRefresh(projectId: string) {
  clearTimeout(pendingRefresh.get(projectId));
  pendingRefresh.delete(projectId);
}
