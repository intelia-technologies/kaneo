import { sendToStatusWebhooks } from "../webhooks";
import type { LoggedChange } from "./service";

export const AUTOMATION_CHANGED_EVENT = "task.automation_changed";

/**
 * `task.automation_changed` for a committed change of the level, from a
 * person's session or the gateway. The envelope's `actor` is the Kaneo user
 * (null for the gateway); `data.changedByActor` is the graph id the gateway
 * acted for. Body documented in README-INTELIA.md.
 */
export function notifyAutomationChanged(
  taskId: string,
  {
    projectId,
    previous,
    value,
    writer,
    changedAt,
  }: LoggedChange & {
    projectId: string;
  },
) {
  return sendToStatusWebhooks(
    AUTOMATION_CHANGED_EVENT,
    taskId,
    projectId,
    "userId" in writer ? writer.userId : null,
    {
      previousLevel: previous?.level ?? null,
      previousVerification: previous?.verification ?? null,
      level: value.level,
      verification: value.verification,
      source: writer.source,
      changedByActor: writer.source === "gateway" ? writer.actor : null,
      changedAt: changedAt.toISOString(),
    },
  );
}
