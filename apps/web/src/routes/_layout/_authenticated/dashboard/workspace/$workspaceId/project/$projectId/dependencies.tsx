import { createFileRoute } from "@tanstack/react-router";
import { DependenciesPage } from "@/intelia/dependencies/components/dependencies-page";

type DependenciesSearchParams = {
  taskId?: string;
  initiativeId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/dependencies",
)({
  component: RouteComponent,
  validateSearch: (
    search: Record<string, unknown>,
  ): DependenciesSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
    initiativeId:
      typeof search.initiativeId === "string" ? search.initiativeId : undefined,
  }),
});

function RouteComponent() {
  const { projectId, workspaceId } = Route.useParams();
  const { taskId, initiativeId } = Route.useSearch();

  return (
    <DependenciesPage
      workspaceId={workspaceId}
      projectId={projectId}
      taskId={taskId}
      initiativeId={initiativeId}
    />
  );
}
