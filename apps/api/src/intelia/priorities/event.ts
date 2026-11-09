import { and, eq } from "drizzle-orm";
import db from "../../database";
import {
  integrationTable,
  projectTable,
  userTable,
  workspaceTable,
} from "../../database/schema";
import { activeIntegrationCondition } from "../../plugins/active-integration-condition";
import { postToGenericWebhook } from "../../plugins/generic-webhook/client";
import {
  type GenericWebhookConfig,
  normalizeGenericWebhookConfig,
} from "../../plugins/generic-webhook/config";
import { safeOutboundError } from "../../utils/outbound-request";
import type { PriorityChangeKind, PriorityChangeSource } from "../schema";
import type { Transaction } from "../task-automation/service";
import {
  loadLinkedProjectIds,
  loadWorkspacePriorities,
  toAncestor,
} from "./read";
import { ancestorsOf, subtreeIds } from "./tree";

export const PRIORITY_CHANGED_EVENT = "intelia.priority_changed";

export type PriorityChange = {
  id: string;
  kind: PriorityChangeKind;
  previous: Record<string, unknown> | null;
  value: Record<string, unknown>;
  source: PriorityChangeSource;
  changedAt: Date;
};

export type PriorityEvent = {
  event: typeof PRIORITY_CHANGED_EVENT;
  timestamp: string;
  integration: { type: "generic-webhook" };
  workspace: { id: string; name: string };
  priority: Record<string, unknown>;
  actor: { id: string; name: string | null };
  data: Record<string, unknown>;
};

/**
 * The body of the event, read inside the change's transaction, so it is the
 * state that change left. `affectedProjectIds` are the projects linked with
 * the priority or with any priority under it, plus those the change unlinked:
 * the boards that show it (alone or in a chain) or stop showing it. Project
 * ids only, never names: every webhook destination of the workspace gets it.
 */
export async function buildPriorityEvent(
  tx: Transaction,
  workspaceId: string,
  priorityId: string,
  change: PriorityChange,
  userId: string,
): Promise<PriorityEvent> {
  const rows = await loadWorkspacePriorities(tx, workspaceId);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const row = byId.get(priorityId);
  if (!row) throw new Error(`Priority ${priorityId} vanished in its change`);
  const subtree = subtreeIds(priorityId, rows);
  const links = await loadLinkedProjectIds(tx, [...subtree]);
  const affected = new Set<string>();
  for (const ids of links.values()) for (const id of ids) affected.add(id);
  // A board the change unlinked stops showing it: that one is affected too.
  const unlinked = change.previous?.projectIds;
  if (Array.isArray(unlinked)) {
    for (const id of unlinked) if (typeof id === "string") affected.add(id);
  }
  const [workspace] = await tx
    .select({ id: workspaceTable.id, name: workspaceTable.name })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);
  const [actor] = await tx
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return {
    event: PRIORITY_CHANGED_EVENT,
    timestamp: new Date().toISOString(),
    integration: { type: "generic-webhook" },
    workspace: { id: workspaceId, name: workspace?.name ?? "" },
    priority: {
      id: row.id,
      parentId: row.parentId,
      title: row.title,
      body: row.body,
      position: row.position,
      status: row.status,
      projectIds: links.get(row.id) ?? [],
      chain: ancestorsOf(row.id, byId).map(toAncestor),
      updatedAt: row.updatedAt.toISOString(),
    },
    actor: { id: userId, name: actor?.name ?? null },
    data: {
      changeId: change.id,
      kind: change.kind,
      previous: change.previous,
      value: change.value,
      source: change.source,
      changedAt: change.changedAt.toISOString(),
      affectedProjectIds: [...affected].sort(),
    },
  };
}

/**
 * Sends the event once to each distinct destination (URL and secret) among
 * the active generic webhooks of the workspace's projects that send
 * task.status_changed, the same rule as our task events (../webhooks.ts),
 * with upstream's envelope client and X-Kaneo-Signature. A priority belongs
 * to the workspace, not to a project, so no project's webhook is its own; the
 * factory points every project at the same receiver, which gets it once.
 * Failures are logged without the destination and never thrown.
 */
export async function sendPriorityEvent(event: PriorityEvent): Promise<void> {
  const integrations = await db
    .select({ config: integrationTable.config })
    .from(integrationTable)
    .innerJoin(projectTable, eq(integrationTable.projectId, projectTable.id))
    .where(
      and(
        eq(projectTable.workspaceId, event.workspace.id),
        eq(integrationTable.type, "generic-webhook"),
        activeIntegrationCondition(),
      ),
    );
  const destinations = new Map<string, GenericWebhookConfig>();
  for (const integration of integrations) {
    // One unreadable configuration must not cost the other destinations.
    let config: GenericWebhookConfig;
    try {
      config = normalizeGenericWebhookConfig(
        JSON.parse(integration.config) as GenericWebhookConfig,
      );
    } catch {
      continue;
    }
    if (!config.events?.taskStatusChanged || !config.webhookUrl) continue;
    destinations.set(`${config.webhookUrl}\n${config.secret ?? ""}`, config);
  }
  for (const config of destinations.values()) {
    try {
      await postToGenericWebhook(config.webhookUrl, event, config.secret);
    } catch (error) {
      console.error("priority webhook failed", {
        error: safeOutboundError(error),
        eventName: event.event,
        workspaceId: event.workspace.id,
        webhookUrl: "configured destination",
      });
    }
  }
}
