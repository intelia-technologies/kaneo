import { and, eq, sql } from "drizzle-orm";
import db from "../../database";
import { userTable, workspaceTable } from "../../database/schema";
import { integrationProviderEnabled } from "../../plugins/active-integration-condition";
import { postToGenericWebhook } from "../../plugins/generic-webhook/client";
import { safeOutboundError } from "../../utils/outbound-request";
import { workspaceIsActive } from "../../workspace/archive/active-workspace-sql";
import {
  type PriorityChangeKind,
  type PriorityChangeSource,
  priorityWebhookTable,
} from "../schema";
import type { Transaction } from "../task-automation/service";
import {
  loadLinkedProjectIds,
  loadWorkspacePriorities,
  toAncestor,
} from "./read";
import { ancestorsOf, subtreeIds } from "./tree";

export const PRIORITY_WEBHOOK_TYPE = "priority-webhook";
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
  integration: { type: typeof PRIORITY_WEBHOOK_TYPE };
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
    integration: { type: PRIORITY_WEBHOOK_TYPE },
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
 * Sends the event to each destination the workspace's administrators
 * registered for priorities (`priority_webhook`), never to the projects'
 * webhooks: an integration set up for one project's tasks must not receive
 * the workspace's priorities. Upstream's client signs it (X-Kaneo-Signature)
 * and refuses private destinations. Nothing goes out while the workspace is
 * archived or the instance administrator turned `generic-webhook` off.
 * Failures are logged without the destination and never thrown.
 */
export async function sendPriorityEvent(event: PriorityEvent): Promise<void> {
  const destinations = await db
    .select({
      url: priorityWebhookTable.url,
      secret: priorityWebhookTable.secret,
    })
    .from(priorityWebhookTable)
    .where(
      and(
        eq(priorityWebhookTable.workspaceId, event.workspace.id),
        workspaceIsActive(priorityWebhookTable.workspaceId),
        integrationProviderEnabled(sql`'generic-webhook'`),
      ),
    );
  for (const destination of destinations) {
    try {
      await postToGenericWebhook(
        destination.url,
        event,
        destination.secret ?? undefined,
      );
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
