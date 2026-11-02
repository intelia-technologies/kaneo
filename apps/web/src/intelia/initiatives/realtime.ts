import type { QueryClient } from "@tanstack/react-query";
import { projectInitiativesRootKey } from "./api";

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

const pendingRefresh = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Called by the project WebSocket (`useProjectWebSocket`) for each message.
 * Only active queries refetch (React Query's default), so a project whose
 * initiatives are not on screen costs nothing.
 */
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
      void queryClient.invalidateQueries({
        queryKey: projectInitiativesRootKey(projectId),
      });
    }, INITIATIVES_BURST_MS),
  );
}
