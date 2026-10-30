import { createFileRoute } from "@tanstack/react-router";
import { DependenciesPage } from "@/intelia/dependencies/components/dependencies-page";

type DependenciesSearchParams = {
  taskId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/dependencies",
)({
  component: RouteComponent,
  validateSearch: (
    search: Record<string, unknown>,
  ): DependenciesSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function RouteComponent() {
  const { projectId, workspaceId } = Route.useParams();
  const { taskId } = Route.useSearch();

  return (
    <DependenciesPage
      workspaceId={workspaceId}
      projectId={projectId}
      taskId={taskId}
    />
  );
}
