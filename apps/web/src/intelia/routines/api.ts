import { client } from "@kaneo/libs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

type TaskRoutineRoute =
  (typeof client)["intelia"]["task"][":taskId"]["routine"];

export type WorkspaceRoutine = InferResponseType<
  (typeof client)["intelia"]["workspace"][":workspaceId"]["routines"]["$get"],
  200
>[number];
export type TaskRoutine = InferResponseType<TaskRoutineRoute["$get"], 200>;
export type RoutineRun = InferResponseType<
  TaskRoutineRoute["runs"]["$get"],
  200
>[number];
export type RoutineInput = { cron: string; timezone: string; active: boolean };

export const RECENT_RUNS = 5;

export async function getWorkspaceRoutines(
  workspaceId: string,
): Promise<WorkspaceRoutine[]> {
  const response = await client.intelia.workspace[":workspaceId"].routines.$get(
    { param: { workspaceId } },
  );
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

// A task without a routine answers 404: that is "not scheduled", not an error.
export async function getTaskRoutine(
  taskId: string,
): Promise<TaskRoutine | null> {
  const response = await client.intelia.task[":taskId"].routine.$get({
    param: { taskId },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function getRoutineRuns(taskId: string): Promise<RoutineRun[]> {
  const response = await client.intelia.task[":taskId"].routine.runs.$get({
    param: { taskId },
    query: { limit: String(RECENT_RUNS) },
  });
  if (response.status === 404) return [];
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function putTaskRoutine(
  taskId: string,
  input: RoutineInput,
): Promise<TaskRoutine> {
  const response = await client.intelia.task[":taskId"].routine.$put({
    param: { taskId },
    json: input,
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function deleteTaskRoutine(taskId: string): Promise<TaskRoutine> {
  const response = await client.intelia.task[":taskId"].routine.$delete({
    param: { taskId },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export const workspaceRoutinesKey = (workspaceId: string) =>
  ["intelia-routines", "workspace", workspaceId] as const;
export const taskRoutineKey = (taskId: string) =>
  ["intelia-routines", "task", taskId] as const;
export const routineRunsKey = (taskId: string) =>
  ["intelia-routines", "runs", taskId] as const;

export function useWorkspaceRoutines(workspaceId: string) {
  return useQuery({
    queryKey: workspaceRoutinesKey(workspaceId),
    queryFn: () => getWorkspaceRoutines(workspaceId),
    enabled: !!workspaceId,
  });
}

export function useTaskRoutine(taskId: string) {
  return useQuery({
    queryKey: taskRoutineKey(taskId),
    queryFn: () => getTaskRoutine(taskId),
    enabled: !!taskId,
  });
}

export function useRoutineRuns(taskId: string, enabled: boolean) {
  return useQuery({
    queryKey: routineRunsKey(taskId),
    queryFn: () => getRoutineRuns(taskId),
    enabled: !!taskId && enabled,
  });
}

// Every routine query starts with "intelia-routines": a change to one task's
// routine also refreshes the workspace list.
function useInvalidateRoutines() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ["intelia-routines"] });
}

export function useSaveRoutine() {
  const invalidate = useInvalidateRoutines();
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: RoutineInput }) =>
      putTaskRoutine(taskId, input),
    onSettled: invalidate,
  });
}

export function useDeleteRoutine() {
  const invalidate = useInvalidateRoutines();
  return useMutation({
    mutationFn: (taskId: string) => deleteTaskRoutine(taskId),
    onSettled: invalidate,
  });
}
