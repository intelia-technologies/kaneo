import { APIError } from "better-auth/api";
import type { InvitationProjectAccess } from "./invitation-project-access-type";
import { isOwnerRole } from "./is-owner-role";
import { resolveProjectAccessRequest } from "./resolve-project-access-request";

export async function resolveInvitationProjectAccess(
  invitation: InvitationProjectAccess & { inviterId: string },
) {
  // Intelia fork: an invitation without a choice is closed (no projects) until
  // someone grants them; owners always get every project.
  const projectAccess =
    invitation.projectAccess ??
    (isOwnerRole(invitation.role) ? "all" : "selected");
  const resolution = await resolveProjectAccessRequest({
    workspaceId: invitation.organizationId,
    actorId: invitation.inviterId,
    targetRole: invitation.role,
    projectAccess,
    projectIds: invitation.projectIds,
  });

  if (!resolution.ok) {
    const status = resolution.status === 400 ? "BAD_REQUEST" : "FORBIDDEN";
    throw new APIError(status, { code: status, message: resolution.message });
  }

  return resolution.access;
}
