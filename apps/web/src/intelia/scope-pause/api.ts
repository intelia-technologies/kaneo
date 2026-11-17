import { client } from "@kaneo/libs";
import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";
import { indexPauses } from "./pause-index";

type ScopePauseList = InferResponseType<
  (typeof client)["intelia"]["workspace"][":workspaceId"]["scope-pauses"]["$get"],
  200
>;
export type ScopePause = ScopePauseList["pausas"][number];
export type ScopePauseChange = InferResponseType<
  (typeof client)["intelia"]["scope-pause"][":pauseId"]["history"]["$get"],
  200
>[number];

// Only the active pauses: the notices and the chips show what holds now.
export async function getActiveScopePauses(
  workspaceId: string,
): Promise<ScopePause[]> {
  const response = await client.intelia.workspace[":workspaceId"][
    "scope-pauses"
  ].$get({ param: { workspaceId }, query: { estado: "activa" } });
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
export const scopePauseHistoryKey = (pauseId: string) =>
  [SCOPE_PAUSE_QUERY_ROOT, "history", pauseId] as const;

// The factory's gateway writes the pauses and Kaneo publishes no event for
// them (design 81 §4.1), so the board asks again at the pace of the other
// factory signals.
const REFRESH_MS = 2 * 60 * 1000;

// One request per workspace for the whole board; `indexPauses` is a stable
// reference, so the index is rebuilt only when the list changes and each card
// looks its task up instead of scanning every pause.
export function useActiveScopePauses(workspaceId: string | undefined) {
  return useQuery({
    queryKey: activeScopePausesKey(workspaceId ?? ""),
    queryFn: () => getActiveScopePauses(workspaceId ?? ""),
    enabled: !!workspaceId,
    refetchInterval: REFRESH_MS,
    select: indexPauses,
  });
}

export function useScopePauseHistory(pauseId: string) {
  return useQuery({
    queryKey: scopePauseHistoryKey(pauseId),
    queryFn: () => getScopePauseHistory(pauseId),
  });
}
