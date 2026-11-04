import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/fetchers/get-api-url";
import { HttpError } from "@/lib/http-error";

export type TaskAlias = {
  ticketId: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  number: number;
  movedAt: string;
};

export type TaskAliasesResponse = {
  aliases: TaskAlias[];
};

export async function getTaskAliases(taskId: string): Promise<TaskAlias[]> {
  const response = await fetch(
    getApiUrl(`/intelia/task/${encodeURIComponent(taskId)}/aliases`),
    {
      credentials: "include",
    },
  );
  if (!response.ok) throw await HttpError.fromResponse(response);
  const data = (await response.json()) as TaskAliasesResponse;
  return data.aliases;
}

export const taskAliasesKey = (taskId: string) =>
  ["intelia-aliases", "task", taskId] as const;

export function useTaskAliases(taskId: string | undefined) {
  return useQuery({
    queryKey: taskAliasesKey(taskId ?? ""),
    queryFn: () => getTaskAliases(taskId ?? ""),
    enabled: !!taskId,
  });
}
