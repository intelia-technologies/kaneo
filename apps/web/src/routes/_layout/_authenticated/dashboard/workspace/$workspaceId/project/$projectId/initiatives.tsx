import { createFileRoute } from "@tanstack/react-router";
import { InitiativesPage } from "@/intelia/initiatives/list/initiatives-page";
import {
  type InitiativesListSearch,
  validateInitiativesListSearch,
} from "@/intelia/initiatives/search";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/initiatives",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): InitiativesListSearch =>
    validateInitiativesListSearch(search),
});

function RouteComponent() {
  const { projectId, workspaceId } = Route.useParams();
  const search = Route.useSearch();

  return (
    <InitiativesPage
      workspaceId={workspaceId}
      projectId={projectId}
      search={search}
    />
  );
}
