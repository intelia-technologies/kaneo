import { createFileRoute } from "@tanstack/react-router";
import { PrioritiesPage } from "@/intelia/priorities/components/priorities-page";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/priorities",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { workspaceId } = Route.useParams();
  return <PrioritiesPage workspaceId={workspaceId} />;
}
