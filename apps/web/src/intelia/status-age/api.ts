import { client } from "@kaneo/libs";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type ProjectStatusAge = InferResponseType<
  (typeof client)["intelia"]["project"][":projectId"]["status-age"]["$get"],
  200
>;
export type StatusAgeColumn = ProjectStatusAge["columnas"][string];

export async function getProjectStatusAge(
  projectId: string,
): Promise<ProjectStatusAge> {
  const response = await client.intelia.project[":projectId"][
    "status-age"
  ].$get({ param: { projectId } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export const STATUS_AGE_QUERY_ROOT = "intelia-status-age";
export const projectStatusAgeKey = (projectId: string) =>
  [STATUS_AGE_QUERY_ROOT, projectId] as const;

// Design 23 §5: the entry dates refresh when the tasks refresh. Upstream
// refreshes a board in many places (refetches, websocket patches, optimistic
// moves), all through the `["tasks", projectId]` query, so one cache listener
// per client follows that query instead of a hook in each of them. Each
// per-project query that refreshes with the tasks (the board signals too)
// registers its key root here.
const followedRoots = new WeakMap<QueryClient, Set<string>>();

export function followProjectTasks(
  queryClient: QueryClient,
  queryRoot: string,
) {
  const known = followedRoots.get(queryClient);
  if (known) {
    known.add(queryRoot);
    return;
  }
  const roots = new Set([queryRoot]);
  followedRoots.set(queryClient, roots);
  queryClient.getQueryCache().subscribe((event) => {
    const [root, projectId] = event.query.queryKey;
    if (
      event.type !== "updated" ||
      event.action.type !== "success" ||
      root !== "tasks" ||
      typeof projectId !== "string" ||
      event.query.queryKey.length !== 2
    ) {
      return;
    }
    for (const followed of roots) {
      void queryClient.invalidateQueries({
        queryKey: [followed, projectId],
        exact: true,
      });
    }
  });
}

// One request per project for every chip of the list or the board.
export function useProjectStatusAge(projectId: string | undefined) {
  const queryClient = useQueryClient();
  followProjectTasks(queryClient, STATUS_AGE_QUERY_ROOT);
  return useQuery({
    queryKey: projectStatusAgeKey(projectId ?? ""),
    queryFn: () => getProjectStatusAge(projectId ?? ""),
    enabled: !!projectId,
  });
}
