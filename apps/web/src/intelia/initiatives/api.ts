import { client } from "@kaneo/libs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

type InitiativeRoute =
  (typeof client)["intelia"]["initiative"][":initiativeId"];

export type ProjectInitiatives = InferResponseType<
  (typeof client)["intelia"]["project"][":projectId"]["initiatives"]["$get"],
  200
>;
export type InitiativeSummary = ProjectInitiatives["initiatives"][number];
export type TaskWithoutInitiative =
  ProjectInitiatives["withoutInitiative"][number];
export type InitiativeDetail = InferResponseType<InitiativeRoute["$get"], 200>;
export type InitiativeTask = InitiativeDetail["tasks"][number];
export type InitiativeExternalTask = InitiativeDetail["externalTasks"][number];
export type InitiativeCounters = InitiativeDetail["counters"];
export type InitiativeState = InitiativeDetail["state"];
export type InitiativeChange = InferResponseType<
  InitiativeRoute["history"]["$get"],
  200
>[number];
export type InitiativeUpdate = InferRequestType<
  InitiativeRoute["$patch"]
>["json"];

export async function getProjectInitiatives(
  projectId: string,
): Promise<ProjectInitiatives> {
  const response = await client.intelia.project[":projectId"].initiatives.$get({
    param: { projectId },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function getInitiative(
  initiativeId: string,
): Promise<InitiativeDetail> {
  const response = await client.intelia.initiative[":initiativeId"].$get({
    param: { initiativeId },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function getInitiativeHistory(
  initiativeId: string,
): Promise<InitiativeChange[]> {
  const response = await client.intelia.initiative[
    ":initiativeId"
  ].history.$get({ param: { initiativeId }, query: { limit: "50" } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function patchInitiative(
  initiativeId: string,
  input: InitiativeUpdate,
) {
  const response = await client.intelia.initiative[":initiativeId"].$patch({
    param: { initiativeId },
    json: input,
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

// Every read of a project's initiatives starts with this prefix, so one
// invalidation (realtime or an edit) refreshes the listing and any detail.
export const INITIATIVES_QUERY_ROOT = "intelia-initiatives";
export const projectInitiativesRootKey = (projectId: string) =>
  [INITIATIVES_QUERY_ROOT, projectId] as const;
export const projectInitiativesKey = (projectId: string) =>
  [INITIATIVES_QUERY_ROOT, projectId, "list"] as const;
export const initiativeKey = (projectId: string, initiativeId: string) =>
  [INITIATIVES_QUERY_ROOT, projectId, "detail", initiativeId] as const;
export const initiativeHistoryKey = (projectId: string, initiativeId: string) =>
  [INITIATIVES_QUERY_ROOT, projectId, "history", initiativeId] as const;

export function useProjectInitiatives(projectId: string) {
  return useQuery({
    queryKey: projectInitiativesKey(projectId),
    queryFn: () => getProjectInitiatives(projectId),
    enabled: !!projectId,
  });
}

export function useInitiative(projectId: string, initiativeId: string) {
  return useQuery({
    queryKey: initiativeKey(projectId, initiativeId),
    queryFn: () => getInitiative(initiativeId),
    enabled: !!projectId && !!initiativeId,
  });
}

export function useInitiativeHistory(projectId: string, initiativeId: string) {
  return useQuery({
    queryKey: initiativeHistoryKey(projectId, initiativeId),
    queryFn: () => getInitiativeHistory(initiativeId),
    enabled: !!projectId && !!initiativeId,
  });
}

export function useUpdateInitiative(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      initiativeId,
      input,
    }: {
      initiativeId: string;
      input: InitiativeUpdate;
    }) => patchInitiative(initiativeId, input),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: projectInitiativesRootKey(projectId),
      }),
  });
}
