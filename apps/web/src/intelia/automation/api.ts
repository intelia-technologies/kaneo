import { client } from "@kaneo/libs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";
import { HISTORY_LIMIT } from "./history-values";

type TaskAutomationRoute =
  (typeof client)["intelia"]["task"][":taskId"]["automation"];

export type TaskAutomation = InferResponseType<
  TaskAutomationRoute["$get"],
  200
>;
export type TaskAutomationChange = InferResponseType<
  TaskAutomationRoute["history"]["$get"],
  200
>[number];
export type DeliveryKind = NonNullable<TaskAutomation["entrega"]>;
// The API's own union, the same type as `automation` when creating a task.
export type AutomationInput = InferRequestType<
  (typeof client)["task"][":projectId"]["$post"]
>["json"]["automation"];
// A change: any subset of the fields (design 48 §3.2).
export type AutomationChangeInput = InferRequestType<
  TaskAutomationRoute["$put"]
>["json"];

// A task without automation answers 404: that is "none", not an error.
export async function getTaskAutomation(
  taskId: string,
): Promise<TaskAutomation | null> {
  const response = await client.intelia.task[":taskId"].automation.$get({
    param: { taskId },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function getTaskAutomationHistory(
  taskId: string,
): Promise<TaskAutomationChange[]> {
  const response = await client.intelia.task[":taskId"].automation.history.$get(
    {
      param: { taskId },
      // One more than is shown: the oldest shown takes its before from it.
      query: { limit: String(HISTORY_LIMIT + 1) },
    },
  );
  if (response.status === 404) return [];
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function getProjectAutomation(
  projectId: string,
): Promise<TaskAutomation[]> {
  const response = await client.intelia.project[":projectId"].automation.$get({
    param: { projectId },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function putTaskAutomation(
  taskId: string,
  input: AutomationChangeInput,
): Promise<TaskAutomation> {
  const response = await client.intelia.task[":taskId"].automation.$put({
    param: { taskId },
    json: input,
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export const AUTOMATION_QUERY_ROOT = "intelia-automation";
export const taskAutomationKey = (taskId: string) =>
  [AUTOMATION_QUERY_ROOT, "task", taskId] as const;
export const taskAutomationHistoryKey = (taskId: string) =>
  [AUTOMATION_QUERY_ROOT, "history", taskId] as const;
export const projectAutomationKey = (projectId: string) =>
  [AUTOMATION_QUERY_ROOT, "project", projectId] as const;

export function useTaskAutomation(taskId: string) {
  return useQuery({
    queryKey: taskAutomationKey(taskId),
    queryFn: () => getTaskAutomation(taskId),
    enabled: !!taskId,
  });
}

export function useTaskAutomationHistory(taskId: string) {
  return useQuery({
    queryKey: taskAutomationHistoryKey(taskId),
    queryFn: () => getTaskAutomationHistory(taskId),
    enabled: !!taskId,
  });
}

// A module-level `select` keeps React Query from rebuilding the Map on every
// render of the same observer. Each observer still builds its own Map.
const byTaskId = (rows: TaskAutomation[]) =>
  new Map<string, TaskAutomation>(rows.map((row) => [row.taskId, row]));

// One request per project for the board badges and the filter, keyed by task.
export function useProjectAutomation(projectId: string | undefined) {
  return useQuery({
    queryKey: projectAutomationKey(projectId ?? ""),
    queryFn: () => getProjectAutomation(projectId ?? ""),
    enabled: !!projectId,
    select: byTaskId,
  });
}

// Every automation query starts with AUTOMATION_QUERY_ROOT: a change to one
// task also refreshes its project's badges.
export function useInvalidateAutomation() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: [AUTOMATION_QUERY_ROOT] });
}

export function useSetTaskAutomation() {
  const invalidate = useInvalidateAutomation();
  return useMutation({
    mutationFn: ({
      taskId,
      input,
    }: {
      taskId: string;
      input: AutomationChangeInput;
    }) => putTaskAutomation(taskId, input),
    onSettled: invalidate,
  });
}
