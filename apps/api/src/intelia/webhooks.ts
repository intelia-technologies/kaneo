import { and, eq } from "drizzle-orm";
import db from "../database";
import { integrationTable } from "../database/schema";
import { activeIntegrationCondition } from "../plugins/active-integration-condition";
import {
  type GenericWebhookConfig,
  normalizeGenericWebhookConfig,
} from "../plugins/generic-webhook/config";
import { createHmac } from "node:crypto";
import {
  genericWebhookPayload,
  sendEvent,
} from "../plugins/generic-webhook/events";
import { sendOutboundRequest } from "../utils/outbound-request";

/**
 * Sends one of our events only to the dispatcher (design 82, decision 25):
 * `INTELIA_DESPACHADOR_WEBHOOK_URL`, signed with
 * `INTELIA_DESPACHADOR_WEBHOOK_SECRET`, with the generic webhook's envelope
 * and `X-Kaneo-Signature`. For events that carry data of several projects,
 * which no project's webhooks may receive. Without both variables nothing is
 * sent and it is logged as an error. The destination comes from the
 * operator's configuration, not from a project: it may be on the private
 * network (the dispatcher's `/webhooks/kaneo`).
 */
export async function sendToDispatcher(
  eventName: string,
  taskId: string,
  projectId: string,
  userId: string | null,
  data: Record<string, unknown>,
): Promise<boolean> {
  const url = process.env.INTELIA_DESPACHADOR_WEBHOOK_URL?.trim();
  const secret = process.env.INTELIA_DESPACHADOR_WEBHOOK_SECRET;
  if (!url || !secret) {
    console.error("dispatcher webhook not configured: event not sent", {
      eventName,
      taskId,
    });
    return false;
  }
  const payload = await genericWebhookPayload(
    eventName,
    taskId,
    projectId,
    userId,
    data,
  );
  if (!payload) return false;
  const body = JSON.stringify(payload);
  await sendOutboundRequest(url, {
    headers: {
      "Content-Type": "application/json",
      "X-Kaneo-Signature": createHmac("sha256", secret)
        .update(body)
        .digest("hex"),
    },
    body,
  });
  return true;
}

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
