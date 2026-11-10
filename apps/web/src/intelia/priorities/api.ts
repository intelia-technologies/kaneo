import { client } from "@kaneo/libs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

type PriorityRoute = (typeof client)["intelia"]["priority"][":priorityId"];
type WorkspaceRoute =
  (typeof client)["intelia"]["workspace"][":workspaceId"]["priorities"];

export type Priority = InferResponseType<
  WorkspaceRoute["$get"],
  200
>["priorities"][number];
export type BoardPriority = InferResponseType<
  (typeof client)["intelia"]["project"][":projectId"]["priorities"]["$get"],
  200
>["priorities"][number];
export type PriorityChange = InferResponseType<
  PriorityRoute["history"]["$get"],
  200
>["changes"][number];
export type PriorityCreate = InferRequestType<WorkspaceRoute["$post"]>["json"];
export type PriorityUpdate = InferRequestType<PriorityRoute["$patch"]>["json"];

// Every read of priorities shares this prefix: any edit refreshes them all
// (the tree, each board's panel and the histories).
const ROOT_KEY = "intelia-priorities";
export const workspacePrioritiesKey = (workspaceId: string) =>
  [ROOT_KEY, "workspace", workspaceId] as const;
export const projectPrioritiesKey = (projectId: string) =>
  [ROOT_KEY, "project", projectId] as const;
export const priorityHistoryKey = (priorityId: string) =>
  [ROOT_KEY, "history", priorityId] as const;

export function useWorkspacePriorities(workspaceId: string) {
  return useQuery({
    queryKey: workspacePrioritiesKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const response = await client.intelia.workspace[
        ":workspaceId"
      ].priorities.$get({ param: { workspaceId }, query: {} });
      if (!response.ok) throw await HttpError.fromResponse(response);
      return (await response.json()).priorities;
    },
  });
}

// The board's panel: they change rarely and have no socket of their own, so
// they are reread when the board comes back into view.
export function useProjectPriorities(projectId: string) {
  return useQuery({
    queryKey: projectPrioritiesKey(projectId),
    enabled: Boolean(projectId),
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    queryFn: async () => {
      const response = await client.intelia.project[
        ":projectId"
      ].priorities.$get({ param: { projectId } });
      if (!response.ok) throw await HttpError.fromResponse(response);
      return (await response.json()).priorities;
    },
  });
}

export function usePriorityHistory(priorityId: string, enabled: boolean) {
  return useQuery({
    queryKey: priorityHistoryKey(priorityId),
    enabled,
    queryFn: async () => {
      const response = await client.intelia.priority[
        ":priorityId"
      ].history.$get({ param: { priorityId }, query: { limit: "50" } });
      if (!response.ok) throw await HttpError.fromResponse(response);
      return (await response.json()).changes;
    },
  });
}

export function useCreatePriority(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PriorityCreate) => {
      const response = await client.intelia.workspace[
        ":workspaceId"
      ].priorities.$post({ param: { workspaceId }, json: input });
      if (!response.ok) throw await HttpError.fromResponse(response);
      return response.json();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useUpdatePriority() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      priorityId,
      input,
    }: {
      priorityId: string;
      input: PriorityUpdate;
    }) => {
      const response = await client.intelia.priority[":priorityId"].$patch({
        param: { priorityId },
        json: input,
      });
      if (!response.ok) throw await HttpError.fromResponse(response);
      return response.json();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}
