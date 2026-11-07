import { and, eq } from "drizzle-orm";
import db from "../database";
import { integrationTable } from "../database/schema";
import { activeIntegrationCondition } from "../plugins/active-integration-condition";
import {
  type GenericWebhookConfig,
  normalizeGenericWebhookConfig,
} from "../plugins/generic-webhook/config";
import { sendEvent } from "../plugins/generic-webhook/events";

/**
 * Sends one of our events with upstream's generic webhook (same envelope and
 * X-Kaneo-Signature) to every active generic webhook of the project that sends
 * task.status_changed: upstream's configuration has no box for our events.
 * "Active" is upstream's activeIntegrationCondition: enabled, workspace not
 * archived and provider not turned off by an administrator.
 * Bodies documented in README-INTELIA.md.
 */
export async function sendToStatusWebhooks(
  eventName: string,
  taskId: string,
  projectId: string,
  userId: string | null,
  data: Record<string, unknown>,
) {
  const integrations = await db
    .select({ config: integrationTable.config })
    .from(integrationTable)
    .where(
      and(
        eq(integrationTable.projectId, projectId),
        eq(integrationTable.type, "generic-webhook"),
        activeIntegrationCondition(),
      ),
    );
  for (const integration of integrations) {
    const config = normalizeGenericWebhookConfig(
      JSON.parse(integration.config) as GenericWebhookConfig,
    );
    if (!config.events?.taskStatusChanged) continue;
    await sendEvent(config, eventName, taskId, projectId, userId, data);
  }
}
