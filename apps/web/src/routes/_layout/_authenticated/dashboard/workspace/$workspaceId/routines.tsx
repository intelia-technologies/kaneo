import { createFileRoute } from "@tanstack/react-router";
import { RoutinesPage } from "@/intelia/routines/components/routines-page";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/routines",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { workspaceId } = Route.useParams();
  return <RoutinesPage workspaceId={workspaceId} />;
}
