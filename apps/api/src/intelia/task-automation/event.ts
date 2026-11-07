import { sendToStatusWebhooks } from "../webhooks";
import type { LoggedChange } from "./service";

export const AUTOMATION_CHANGED_EVENT = "task.automation_changed";

/**
 * `task.automation_changed` for a committed change of the level, from a
 * person's session or an account's API key. The envelope's `actor` is the
 * Kaneo user that wrote it; `data.changedByActor` is the graph id an API key's
 * caller declared (informative). Body documented in README-INTELIA.md.
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
      previousAutomatica: previous?.automatica ?? null,
      automatica: value.automatica,
      previousPausaMotivo: previous?.pausaMotivo ?? null,
      pausaMotivo: value.pausaMotivo,
      previousEntrega: previous?.entrega ?? null,
      entrega: value.entrega,
      source: writer.source,
      changedByActor: writer.source === "api_key" ? writer.actor : null,
      changedAt: changedAt.toISOString(),
    },
  );
}
