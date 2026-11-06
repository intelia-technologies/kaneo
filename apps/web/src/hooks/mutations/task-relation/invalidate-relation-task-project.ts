import type { QueryClient } from "@tanstack/react-query";
// A task may not be present in a cached page, and either endpoint can affect
// a board in another project (subtask counts and incoming blockers).
export function invalidateRelationTaskProject(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ["tasks"] });
}
