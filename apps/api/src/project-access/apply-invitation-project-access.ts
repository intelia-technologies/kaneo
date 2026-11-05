import db from "../database";
import type { InvitationProjectAccess } from "./invitation-project-access-type";
import { isOwnerRole } from "./is-owner-role";
import { replaceMemberProjectAccess } from "./replace-member-project-access";

export async function applyInvitationProjectAccess(
  invitation: InvitationProjectAccess,
  userId: string,
) {
  // Intelia fork: only an explicit "all" opens every project; a missing or
  // unknown choice stays closed.
  const restricted =
    invitation.projectAccess !== "all" && !isOwnerRole(invitation.role);
  const projectIds = Array.isArray(invitation.projectIds)
    ? invitation.projectIds.filter((id): id is string => typeof id === "string")
    : [];

  await db.transaction((tx) =>
    replaceMemberProjectAccess(tx, {
      workspaceId: invitation.organizationId,
      userId,
      projectAccess: restricted ? "selected" : "all",
      projectIds,
    }),
  );
}
