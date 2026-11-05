import { client } from "@kaneo/libs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

type ProjectInitiativesRoute =
  (typeof client)["intelia"]["project"][":projectId"]["initiatives"];

type InitiativeRoute =
  (typeof client)["intelia"]["initiative"][":initiativeId"];

type TaskInitiativeRoute =
  (typeof client)["intelia"]["task"][":taskId"]["initiative"];

// What the selector needs from the project's listing (IN-02).
export type InitiativeOption = {
  id: string;
  name: string;
  planClosedAt: string | null;
};

export type Initiative = InferResponseType<
  ProjectInitiativesRoute["$post"],
  201
>;

export type TaskInitiative = InferResponseType<
  TaskInitiativeRoute["$get"],
  200
>;

export type TaskInitiativeChange = InferResponseType<
  TaskInitiativeRoute["history"]["$get"],
  200
>[number];

export type InitiativeChange = InferResponseType<
  InitiativeRoute["history"]["$get"],
  200
>[number];

export const HISTORY_LIMIT = 50;

// The project's listing with counters (one request, fixed number of queries
// on the server) reduced to the selector's fields, sorted by name.
export async function getInitiativeOptions(
  projectId: string,
): Promise<InitiativeOption[]> {
  const response = await client.intelia.project[":projectId"].initiatives.$get({
    param: { projectId },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  const { initiatives } = await response.json();
  return initiatives
    .map(({ id, name, planClosedAt }) => ({ id, name, planClosedAt }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
}

export async function getTaskInitiative(
  taskId: string,
): Promise<TaskInitiative | null> {
  const response = await client.intelia.task[":taskId"].initiative.$get({
    param: { taskId },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function getTaskInitiativeHistory(
  taskId: string,
): Promise<TaskInitiativeChange[]> {
  const response = await client.intelia.task[":taskId"].initiative.history.$get(
    {
      param: { taskId },
      query: { limit: String(HISTORY_LIMIT) },
    },
  );
  if (response.status === 404) return [];
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function getInitiativeHistory(
  initiativeId: string,
): Promise<InitiativeChange[]> {
  const response = await client.intelia.initiative[
    ":initiativeId"
  ].history.$get({
    param: { initiativeId },
    query: { limit: String(HISTORY_LIMIT) },
  });
  if (response.status === 404) return [];
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function createInitiative(
  projectId: string,
  name: string,
): Promise<Initiative> {
  const response = await client.intelia.project[":projectId"].initiatives.$post(
    {
      param: { projectId },
      json: { name },
    },
  );
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function putTaskInitiative(
  taskId: string,
  initiativeId: string,
): Promise<TaskInitiative> {
  const response = await client.intelia.task[":taskId"].initiative.$put({
    param: { taskId },
    json: { initiativeId },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function postClosePlan(initiativeId: string): Promise<Initiative> {
  const response = await client.intelia.initiative[":initiativeId"][
    "close-plan"
  ].$post({
    param: { initiativeId },
    json: {},
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export const INITIATIVE_QUERY_ROOT = "intelia-initiative";

export const initiativeOptionsKey = (projectId: string) =>
  [INITIATIVE_QUERY_ROOT, "options", projectId] as const;

export const taskInitiativeKey = (taskId: string) =>
  [INITIATIVE_QUERY_ROOT, "task", taskId] as const;

export const taskInitiativeHistoryKey = (taskId: string) =>
  [INITIATIVE_QUERY_ROOT, "task-history", taskId] as const;

export const initiativeHistoryKey = (initiativeId: string) =>
  [INITIATIVE_QUERY_ROOT, "initiative-history", initiativeId] as const;

export function useInitiativeOptions(projectId: string | undefined) {
  return useQuery({
    queryKey: initiativeOptionsKey(projectId ?? ""),
    queryFn: () => getInitiativeOptions(projectId ?? ""),
    enabled: !!projectId,
  });
}

export function useCreateInitiative() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, name }: { projectId: string; name: string }) =>
      createInitiative(projectId, name),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: initiativeOptionsKey(variables.projectId),
      });
    },
  });
}

export function useTaskInitiative(taskId: string | undefined) {
  return useQuery({
    queryKey: taskInitiativeKey(taskId ?? ""),
    queryFn: () => getTaskInitiative(taskId ?? ""),
    enabled: !!taskId,
  });
}

export function useTaskInitiativeHistory(taskId: string | undefined) {
  return useQuery({
    queryKey: taskInitiativeHistoryKey(taskId ?? ""),
    queryFn: () => getTaskInitiativeHistory(taskId ?? ""),
    enabled: !!taskId,
  });
}

export function useInitiativeHistory(initiativeId: string | undefined) {
  return useQuery({
    queryKey: initiativeHistoryKey(initiativeId ?? ""),
    queryFn: () => getInitiativeHistory(initiativeId ?? ""),
    enabled: !!initiativeId,
  });
}

export function useInvalidateInitiatives() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: [INITIATIVE_QUERY_ROOT] });
}

export function useSetTaskInitiative() {
  const invalidate = useInvalidateInitiatives();
  return useMutation({
    mutationFn: ({
      taskId,
      initiativeId,
    }: {
      taskId: string;
      initiativeId: string;
    }) => putTaskInitiative(taskId, initiativeId),
    onSettled: invalidate,
  });
}

export function useClosePlan() {
  const invalidate = useInvalidateInitiatives();
  return useMutation({
    mutationFn: ({ initiativeId }: { initiativeId: string }) =>
      postClosePlan(initiativeId),
    onSettled: invalidate,
  });
}

// Reads and edits of the «Iniciativas» view (IN-04, design 19 §5 and §6).

export type ProjectInitiatives = InferResponseType<
  ProjectInitiativesRoute["$get"],
  200
>;
export type InitiativeSummary = ProjectInitiatives["initiatives"][number];
export type TaskWithoutInitiative =
  ProjectInitiatives["withoutInitiative"][number];
export type InitiativeDetail = InferResponseType<InitiativeRoute["$get"], 200>;
export type InitiativePlan = InferResponseType<
  InitiativeRoute["plan"]["$get"],
  200
>;
export type InitiativeTask = InitiativeDetail["tasks"][number];
export type InitiativeExternalTask = InitiativeDetail["externalTasks"][number];
export type InitiativeCounters = InitiativeDetail["counters"];
export type InitiativeState = InitiativeDetail["state"];
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

export async function getInitiativePlan(
  initiativeId: string,
): Promise<InitiativePlan> {
  const response = await client.intelia.initiative[":initiativeId"].plan.$get({
    param: { initiativeId },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function patchInitiative(
  initiativeId: string,
  input: InitiativeUpdate,
): Promise<Initiative> {
  const response = await client.intelia.initiative[":initiativeId"].$patch({
    param: { initiativeId },
    json: input,
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

// Under INITIATIVE_QUERY_ROOT, so the selector's mutations refresh the view
// too; one invalidation of the project prefix (realtime) refreshes the
// listing and any open detail.
export const projectInitiativesRootKey = (projectId: string) =>
  [INITIATIVE_QUERY_ROOT, "project", projectId] as const;
export const projectInitiativesKey = (projectId: string) =>
  [...projectInitiativesRootKey(projectId), "list"] as const;
export const initiativeKey = (projectId: string, initiativeId: string) =>
  [...projectInitiativesRootKey(projectId), "detail", initiativeId] as const;
export const initiativePlanKey = (projectId: string, initiativeId: string) =>
  [...projectInitiativesRootKey(projectId), "plan", initiativeId] as const;

// The app's client turns refetchOnMount off; a read invalidated while its
// page was closed (an edit in the detail, a socket event) must be read again
// when the page comes back. `true` refetches only stale data.
export function useProjectInitiatives(projectId: string) {
  return useQuery({
    queryKey: projectInitiativesKey(projectId),
    queryFn: () => getProjectInitiatives(projectId),
    enabled: !!projectId,
    refetchOnMount: true,
  });
}

export function useInitiative(projectId: string, initiativeId: string) {
  return useQuery({
    queryKey: initiativeKey(projectId, initiativeId),
    queryFn: () => getInitiative(initiativeId),
    enabled: !!projectId && !!initiativeId,
    refetchOnMount: true,
  });
}

export function useInitiativePlan(
  projectId: string,
  initiativeId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: initiativePlanKey(projectId, initiativeId),
    queryFn: () => getInitiativePlan(initiativeId),
    enabled: enabled && !!projectId && !!initiativeId,
    refetchOnMount: true,
  });
}

export function useUpdateInitiative() {
  const invalidate = useInvalidateInitiatives();
  return useMutation({
    mutationFn: ({
      initiativeId,
      input,
    }: {
      initiativeId: string;
      input: InitiativeUpdate;
    }) => patchInitiative(initiativeId, input),
    onSettled: invalidate,
  });
}
