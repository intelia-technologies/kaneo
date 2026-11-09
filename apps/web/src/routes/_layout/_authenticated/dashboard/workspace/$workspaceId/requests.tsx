import { createFileRoute } from "@tanstack/react-router";
import { RequestsPage } from "@/intelia/requests/components/requests-page";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/requests",
)({
  validateSearch: (search: Record<string, unknown>): { taskId?: string } =>
    typeof search.taskId === "string" && search.taskId !== ""
      ? { taskId: search.taskId }
      : {},
  component: RouteComponent,
});

function RouteComponent() {
  const { workspaceId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <RequestsPage
      workspaceId={workspaceId}
      selectedTaskId={taskId}
      onSelect={(next) => navigate({ search: next ? { taskId: next } : {} })}
    />
  );
}
