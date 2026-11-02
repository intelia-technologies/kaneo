import { createFileRoute } from "@tanstack/react-router";
import { InitiativeDetailPage } from "@/intelia/initiatives/detail/initiative-detail-page";
import {
  type InitiativeDetailSearch,
  validateInitiativeDetailSearch,
} from "@/intelia/initiatives/search";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/initiatives_/$initiativeId",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): InitiativeDetailSearch =>
    validateInitiativeDetailSearch(search),
});

function RouteComponent() {
  const { projectId, workspaceId, initiativeId } = Route.useParams();
  const search = Route.useSearch();

  return (
    <InitiativeDetailPage
      workspaceId={workspaceId}
      projectId={projectId}
      initiativeId={initiativeId}
      search={search}
    />
  );
}
