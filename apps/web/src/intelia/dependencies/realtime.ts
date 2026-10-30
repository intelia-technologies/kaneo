import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { projectRelationsKey } from "./api";

// Window that groups a burst of WebSocket events into one relations read and
// one graph layout. It runs from the first event, so a steady stream still
// refreshes every window instead of waiting for silence.
export const BURST_MS = 250;

const RELATION_EVENTS: Record<string, true> = {
  TASK_CREATED: true,
  TASK_UPDATED: true,
  TASK_DELETED: true,
  TASK_MOVED: true,
  TASK_RELATION_UPDATED: true,
};

const pendingRefresh = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Called by the project WebSocket (`useProjectWebSocket`) for each message.
 * Tasks already arrive through the board cache; this keeps the project's
 * relations, and the external tasks they reach, in step. After a reconnect,
 * React Query refetches them on focus or when the network returns.
 */
export function refreshDependencies(
  queryClient: QueryClient,
  projectId: string,
  eventType: unknown,
) {
  if (
    typeof eventType !== "string" ||
    !Object.hasOwn(RELATION_EVENTS, eventType)
  )
    return;
  if (pendingRefresh.has(projectId)) return;
  pendingRefresh.set(
    projectId,
    setTimeout(() => {
      pendingRefresh.delete(projectId);
      void queryClient.invalidateQueries({
        queryKey: projectRelationsKey(projectId),
      });
    }, BURST_MS),
  );
}

/**
 * Returns `value`, but holds later changes for one `BURST_MS` window and then
 * shows the latest, so a burst of cache updates yields a single layout. Until
 * `isComplete` holds for what is shown (the first load), changes pass through.
 */
export function useBurstValue<T>(
  value: T,
  isComplete: (shown: T) => boolean,
): T {
  const [shown, setShown] = useState(value);
  const latest = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const passThrough = !isComplete(shown);

  useEffect(() => {
    latest.current = value;
    if (passThrough) {
      setShown(value);
      return;
    }
    if (timer.current !== undefined || Object.is(shown, value)) return;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setShown(latest.current);
    }, BURST_MS);
  }, [value, shown, passThrough]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return passThrough ? value : shown;
}
