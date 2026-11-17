import { client } from "@kaneo/libs";
import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";
import { indexPauses, type ScopePauseIndex } from "./pause-index";

type ScopePauseList = InferResponseType<
  (typeof client)["intelia"]["workspace"][":workspaceId"]["scope-pauses"]["$get"],
  200
>;
export type ScopePause = ScopePauseList["pausas"][number];
export type ScopePauseChange = InferResponseType<
  (typeof client)["intelia"]["scope-pause"][":pauseId"]["history"]["$get"],
  200
>[number];

// `activa` for the notices and the chips (what holds now); `todas` adds the
// resumed ones, for the log of a scope's past pauses.
export async function getScopePauses(
  workspaceId: string,
  estado: "activa" | "todas",
): Promise<ScopePause[]> {
  const response = await client.intelia.workspace[":workspaceId"][
    "scope-pauses"
  ].$get({ param: { workspaceId }, query: { estado } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return (await response.json()).pausas;
}

export async function getScopePauseHistory(
  pauseId: string,
): Promise<ScopePauseChange[]> {
  const response = await client.intelia["scope-pause"][":pauseId"].history.$get(
    { param: { pauseId } },
  );
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export const SCOPE_PAUSE_QUERY_ROOT = "intelia-scope-pause";
export const activeScopePausesKey = (workspaceId: string) =>
  [SCOPE_PAUSE_QUERY_ROOT, "active", workspaceId] as const;
export const allScopePausesKey = (workspaceId: string) =>
  [SCOPE_PAUSE_QUERY_ROOT, "all", workspaceId] as const;
export const scopePauseHistoryKey = (pauseId: string) =>
  [SCOPE_PAUSE_QUERY_ROOT, "history", pauseId] as const;

// Every pause, resumed ones included: read only while the log is open, so
// the board never loads the workspace's past pauses.
export function useAllScopePauses(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: allScopePausesKey(workspaceId),
    queryFn: () => getScopePauses(workspaceId, "todas"),
    enabled: enabled && !!workspaceId,
  });
}

// The factory's gateway writes the pauses and Kaneo publishes no event for
// them (design 81 §4.1), so the board asks again at the pace of the other
// factory signals.
const REFRESH_MS = 2 * 60 * 1000;

// One request per workspace for the whole board. Every card is an observer
// and `select` runs per observer, so the index is built once per list and
// shared: each card looks its task up instead of scanning every pause.
const indexes = new WeakMap<ScopePause[], ScopePauseIndex>();
function sharedIndex(pauses: ScopePause[]): ScopePauseIndex {
  let index = indexes.get(pauses);
  if (!index) {
    index = indexPauses(pauses);
    indexes.set(pauses, index);
  }
  return index;
}

export function useActiveScopePauses(workspaceId: string | undefined) {
  return useQuery({
    queryKey: activeScopePausesKey(workspaceId ?? ""),
    queryFn: () => getScopePauses(workspaceId ?? "", "activa"),
    enabled: !!workspaceId,
    refetchInterval: REFRESH_MS,
    select: sharedIndex,
  });
}

export function useScopePauseHistory(pauseId: string) {
  return useQuery({
    queryKey: scopePauseHistoryKey(pauseId),
    queryFn: () => getScopePauseHistory(pauseId),
  });
}
