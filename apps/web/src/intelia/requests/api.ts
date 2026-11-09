import { client } from "@kaneo/libs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

type RequestRoute = (typeof client)["intelia"]["request"][":taskId"];

export type MyRequest = InferResponseType<
  (typeof client)["intelia"]["workspace"][":workspaceId"]["requests"]["$get"],
  200
>["requests"][number];
export type RequestDetail = InferResponseType<RequestRoute["$get"], 200>;

export async function getMyRequests(workspaceId: string): Promise<MyRequest[]> {
  const response = await client.intelia.workspace[":workspaceId"].requests.$get(
    { param: { workspaceId } },
  );
  if (!response.ok) throw await HttpError.fromResponse(response);
  return (await response.json()).requests;
}

export async function getRequest(taskId: string): Promise<RequestDetail> {
  const response = await client.intelia.request[":taskId"].$get({
    param: { taskId },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function commentRequest(
  taskId: string,
  content: string,
): Promise<RequestDetail> {
  const response = await client.intelia.request[":taskId"].comments.$post({
    param: { taskId },
    json: { content },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export const myRequestsKey = (workspaceId: string) =>
  ["intelia-requests", "workspace", workspaceId] as const;
export const requestKey = (taskId: string) =>
  ["intelia-requests", "request", taskId] as const;

export function useMyRequests(workspaceId: string) {
  return useQuery({
    queryKey: myRequestsKey(workspaceId),
    queryFn: () => getMyRequests(workspaceId),
    enabled: !!workspaceId,
    refetchOnMount: true,
  });
}

export function useRequest(taskId: string | undefined) {
  return useQuery({
    queryKey: requestKey(taskId ?? ""),
    queryFn: () => getRequest(taskId!),
    enabled: !!taskId,
    refetchOnMount: true,
  });
}

export function useCommentRequest(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => commentRequest(taskId, content),
    onSuccess: (detail) => queryClient.setQueryData(requestKey(taskId), detail),
  });
}
