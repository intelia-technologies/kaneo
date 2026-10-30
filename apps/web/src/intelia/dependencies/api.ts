import { client } from "@kaneo/libs";
import { useQuery } from "@tanstack/react-query";
import { HttpError } from "@/lib/http-error";

export async function getProjectRelations(projectId: string) {
  const response = await client.intelia.project[":projectId"].relations.$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export const projectRelationsKey = (projectId: string) =>
  ["project-relations", projectId] as const;

export function useGetProjectRelations(projectId: string) {
  return useQuery({
    queryKey: projectRelationsKey(projectId),
    queryFn: () => getProjectRelations(projectId),
    enabled: !!projectId,
  });
}
