import { and, eq, inArray, max, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import {
  type PriorityChangeKind,
  priorityChangeTable,
  priorityProjectTable,
  priorityTable,
} from "../schema";
import type { Transaction } from "../task-automation/service";
import type { PriorityWriter } from "./access";
import {
  buildPriorityEvent,
  type PriorityEvent,
  sendPriorityEvent,
} from "./event";
import {
  loadLinkedProjectIds,
  loadWorkspacePriorities,
  type PriorityRow,
} from "./read";
import type { CreatePriorityInput, UpdatePriorityInput } from "./schema";
import { createsCycle, placeAt } from "./tree";

// Every write of a workspace's priorities holds one lock per workspace for
// its transaction: two moves at once cannot build a cycle between them, and
// sibling positions stay 0..n-1.
async function lockWorkspace(tx: Transaction, workspaceId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`intelia.priority:${workspaceId}`}, 0))`,
  );
}

// The workspace's projects the writer can read, of those requested. Any other
// id (another workspace, unknown, or not readable) rejects the whole write.
async function assertLinkableProjects(
  tx: Transaction,
  workspaceId: string,
  writer: PriorityWriter,
  projectIds: readonly string[],
) {
  if (projectIds.length === 0) return;
  const found = await tx
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(
      and(
        inArray(projectTable.id, [...projectIds]),
        eq(projectTable.workspaceId, workspaceId),
        projectAccessCondition(writer.userId, projectTable.id),
      ),
    );
  if (found.length !== projectIds.length) {
    throw new ApiError(400, {
      message:
        "Some projects do not exist in this workspace or the caller cannot read them",
      code: "PRIORITY_PROJECT_NOT_FOUND",
    });
  }
}

// Of these linked projects, the ones the writer cannot read: an edit of the
// links keeps them, since the writer never saw them.
async function hiddenFrom(
  tx: Transaction,
  writer: PriorityWriter,
  projectIds: readonly string[],
): Promise<string[]> {
  if (projectIds.length === 0) return [];
  const readable = new Set(
    (
      await tx
        .select({ id: projectTable.id })
        .from(projectTable)
        .where(
          and(
            inArray(projectTable.id, [...projectIds]),
            projectAccessCondition(writer.userId, projectTable.id),
          ),
        )
    ).map((row) => row.id),
  );
  return projectIds.filter((id) => !readable.has(id));
}

const unique = (ids: readonly string[]) => [...new Set(ids)].sort();

function siblingsOf(
  rows: readonly PriorityRow[],
  parentId: string | null,
): string[] {
  return rows
    .filter((row) => row.parentId === parentId)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((row) => row.id);
}

// Writes the order of a list of siblings, touching only rows that move.
async function writeOrder(
  tx: Transaction,
  order: readonly string[],
  byId: ReadonlyMap<string, PriorityRow>,
  updatedId: string,
) {
  for (const [position, id] of order.entries()) {
    if (id === updatedId || byId.get(id)?.position === position) continue;
    await tx
      .update(priorityTable)
      .set({ position })
      .where(eq(priorityTable.id, id));
  }
}

// Strictly increasing per priority, so its log orders by time even with two
// writes in the same millisecond. Safe under the workspace lock.
async function nextChangeAt(tx: Transaction, priorityId: string) {
  const [row] = await tx
    .select({ last: max(priorityChangeTable.changedAt) })
    .from(priorityChangeTable)
    .where(eq(priorityChangeTable.priorityId, priorityId));
  const last = row?.last?.getTime() ?? Number.NEGATIVE_INFINITY;
  return new Date(Math.max(Date.now(), last + 1));
}

async function logChange(
  tx: Transaction,
  workspaceId: string,
  priorityId: string,
  kind: PriorityChangeKind,
  previous: Record<string, unknown> | null,
  value: Record<string, unknown>,
  writer: PriorityWriter,
): Promise<PriorityEvent> {
  const changedAt = await nextChangeAt(tx, priorityId);
  await tx
    .update(priorityTable)
    .set({ updatedAt: changedAt })
    .where(eq(priorityTable.id, priorityId));
  const [change] = await tx
    .insert(priorityChangeTable)
    .values({
      priorityId,
      kind,
      previous,
      value,
      changedByUserId: writer.userId,
      source: writer.source,
      changedAt,
    })
    .returning({ id: priorityChangeTable.id });
  if (!change) throw new Error("Priority change was not recorded");
  return buildPriorityEvent(
    tx,
    workspaceId,
    priorityId,
    {
      id: change.id,
      kind,
      previous,
      value,
      source: writer.source,
      changedAt,
    },
    writer.userId,
  );
}

// The event leaves after the commit, without holding the request: a slow
// receiver never delays an edit.
function emit(event: PriorityEvent) {
  void sendPriorityEvent(event).catch((error) =>
    console.error("priority event failed", {
      error: error instanceof Error ? error.message : "unknown",
      workspaceId: event.workspace.id,
    }),
  );
}

export async function createPriority(
  workspaceId: string,
  input: CreatePriorityInput,
  writer: PriorityWriter,
): Promise<string> {
  const { id, event } = await db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const rows = await loadWorkspacePriorities(tx, workspaceId);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const parentId = input.parentId ?? null;
    if (parentId && !byId.has(parentId)) {
      throw new ApiError(400, {
        message: "The parent priority does not exist in this workspace",
        code: "PRIORITY_PARENT_NOT_FOUND",
      });
    }
    const projectIds = unique(input.projectIds ?? []);
    await assertLinkableProjects(tx, workspaceId, writer, projectIds);

    const siblings = siblingsOf(rows, parentId);
    const [created] = await tx
      .insert(priorityTable)
      .values({
        workspaceId,
        parentId,
        title: input.title,
        body: input.body ?? "",
        position: siblings.length,
        createdByUserId: writer.userId,
      })
      .returning();
    if (!created) throw new Error("Priority was not created");
    const row = created;
    const order = placeAt(siblings, row.id, input.position);
    const position = order.indexOf(row.id);
    await writeOrder(tx, order, byId, row.id);
    if (position !== row.position) {
      await tx
        .update(priorityTable)
        .set({ position })
        .where(eq(priorityTable.id, row.id));
    }
    if (projectIds.length > 0) {
      await tx
        .insert(priorityProjectTable)
        .values(
          projectIds.map((projectId) => ({ priorityId: row.id, projectId })),
        );
    }
    const event = await logChange(
      tx,
      workspaceId,
      row.id,
      "created",
      null,
      {
        title: row.title,
        body: row.body,
        status: row.status,
        parentId,
        position,
        projectIds,
      },
      writer,
    );
    return { id: row.id, event };
  });
  emit(event);
  return id;
}

/**
 * Applies the fields that change, in one transaction with one log row and one
 * event. A request that changes nothing writes nothing and sends nothing.
 */
export async function updatePriority(
  priorityId: string,
  workspaceId: string,
  input: UpdatePriorityInput,
  writer: PriorityWriter,
): Promise<void> {
  const event = await db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const rows = await loadWorkspacePriorities(tx, workspaceId);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const current = byId.get(priorityId);
    if (!current)
      throw new HTTPException(404, { message: "Priority not found" });

    const previous: Record<string, unknown> = {};
    const value: Record<string, unknown> = {};
    const fields: Partial<Pick<PriorityRow, "title" | "body" | "status">> = {};
    for (const key of ["title", "body", "status"] as const) {
      const next = input[key];
      if (next === undefined || next === current[key]) continue;
      previous[key] = current[key];
      value[key] = next;
      Object.assign(fields, { [key]: next });
    }

    const parentId =
      input.parentId === undefined ? current.parentId : input.parentId;
    if (parentId !== current.parentId) {
      if (parentId && !byId.has(parentId)) {
        throw new ApiError(400, {
          message: "The parent priority does not exist in this workspace",
          code: "PRIORITY_PARENT_NOT_FOUND",
        });
      }
      // The tree is acyclic under the workspace lock, so only a new parent can
      // close a loop: itself or one of its descendants.
      if (createsCycle(priorityId, parentId, byId)) {
        throw new ApiError(409, {
          message:
            "A priority cannot hang from itself or from one of its descendants",
          code: "PRIORITY_CYCLE",
        });
      }
      previous.parentId = current.parentId;
      value.parentId = parentId;
    }

    // Order: leaving a parent closes the gap; arriving puts it at `position`
    // (last if omitted); staying moves it only if `position` is given.
    const moved = parentId !== current.parentId;
    let position = current.position;
    if (moved || input.position !== undefined) {
      if (moved) {
        await writeOrder(
          tx,
          siblingsOf(rows, current.parentId).filter((id) => id !== priorityId),
          byId,
          priorityId,
        );
      }
      const order = placeAt(
        siblingsOf(rows, parentId),
        priorityId,
        input.position,
      );
      position = order.indexOf(priorityId);
      await writeOrder(tx, order, byId, priorityId);
      if (position !== current.position) {
        previous.position = current.position;
        value.position = position;
      }
    }
    if (moved || position !== current.position || Object.keys(fields).length) {
      await tx
        .update(priorityTable)
        .set({ ...fields, parentId, position })
        .where(eq(priorityTable.id, priorityId));
    }

    if (input.projectIds !== undefined) {
      const linked =
        (await loadLinkedProjectIds(tx, [priorityId])).get(priorityId) ?? [];
      const requested = unique(input.projectIds);
      await assertLinkableProjects(tx, workspaceId, writer, requested);
      const next = unique([
        ...requested,
        ...(await hiddenFrom(tx, writer, linked)),
      ]);
      if (next.join("\n") !== linked.join("\n")) {
        await tx
          .delete(priorityProjectTable)
          .where(eq(priorityProjectTable.priorityId, priorityId));
        if (next.length > 0) {
          await tx
            .insert(priorityProjectTable)
            .values(next.map((projectId) => ({ priorityId, projectId })));
        }
        previous.projectIds = linked;
        value.projectIds = next;
      }
    }

    if (Object.keys(value).length === 0) return null;
    return logChange(
      tx,
      workspaceId,
      priorityId,
      "updated",
      previous,
      value,
      writer,
    );
  });
  if (event) emit(event);
}
