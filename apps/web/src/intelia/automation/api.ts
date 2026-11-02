import { client } from "@kaneo/libs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

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
export type AutomationLevel = TaskAutomation["level"];
// The API's own union: `completa` only with verification (design 18 §3). The
// same type as `automation` when creating a task.
export type AutomationInput = InferRequestType<
  (typeof client)["task"][":projectId"]["$post"]
>["json"]["automation"];

export const HISTORY_LIMIT = 50;

// A task without a level answers 404: that is "no level", not an error.
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
      query: { limit: String(HISTORY_LIMIT) },
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
  input: AutomationInput,
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
      input: AutomationInput;
    }) => putTaskAutomation(taskId, input),
    onSettled: invalidate,
  });
}
