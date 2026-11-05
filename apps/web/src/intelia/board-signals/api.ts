import { client } from "@kaneo/libs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";
import { followProjectTasks } from "../status-age/api";

export type ProjectBoardSignals = InferResponseType<
  (typeof client)["intelia"]["project"][":projectId"]["board-signals"]["$get"],
  200
>;
export type BoardSignalColumn = ProjectBoardSignals["columnas"][string];
export type BoardSignalTask = ProjectBoardSignals["tareas"][string];

export async function getProjectBoardSignals(
  projectId: string,
): Promise<ProjectBoardSignals> {
  const response = await client.intelia.project[":projectId"][
    "board-signals"
  ].$get({ param: { projectId } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export const BOARD_SIGNALS_QUERY_ROOT = "intelia-board-signals";
export const projectBoardSignalsKey = (projectId: string) =>
  [BOARD_SIGNALS_QUERY_ROOT, projectId] as const;

// The factory rewrites the signals every 2 minutes (design 32 §5): the cards
// ask again at that pace, and whenever the project's tasks refresh.
const REFRESH_MS = 2 * 60 * 1000;

// One request per project for every card of the board.
export function useProjectBoardSignals(projectId: string | undefined) {
  const queryClient = useQueryClient();
  followProjectTasks(queryClient, BOARD_SIGNALS_QUERY_ROOT);
  return useQuery({
    queryKey: projectBoardSignalsKey(projectId ?? ""),
    queryFn: () => getProjectBoardSignals(projectId ?? ""),
    enabled: !!projectId,
    refetchInterval: REFRESH_MS,
  });
}
