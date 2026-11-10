import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable, userTable } from "../../database/schema";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import {
  priorityChangeTable,
  priorityProjectTable,
  priorityTable,
} from "../schema";
import type { Transaction } from "../task-automation/service";
import type { PriorityReader } from "./access";
import type { PriorityAncestor, PriorityResponse } from "./response";
import { ancestorsOf, inTreeOrder } from "./tree";

type Database = typeof db | Transaction;

export type PriorityRow = typeof priorityTable.$inferSelect;
type ProjectRef = PriorityResponse["projects"][number];

/** Every priority of the workspace: a handful, so always read whole. */
export function loadWorkspacePriorities(
  database: Database,
  workspaceId: string,
): Promise<PriorityRow[]> {
  return database
    .select()
    .from(priorityTable)
    .where(eq(priorityTable.workspaceId, workspaceId));
}

/** Every link of these priorities, without any access filter (ids only). */
export async function loadLinkedProjectIds(
  database: Database,
  priorityIds: readonly string[],
): Promise<Map<string, string[]>> {
  const links = new Map<string, string[]>();
  if (priorityIds.length === 0) return links;
  const rows = await database
    .select({
      priorityId: priorityProjectTable.priorityId,
      projectId: priorityProjectTable.projectId,
    })
    .from(priorityProjectTable)
    .where(inArray(priorityProjectTable.priorityId, [...priorityIds]))
    .orderBy(asc(priorityProjectTable.projectId));
  for (const row of rows) {
    const list = links.get(row.priorityId) ?? [];
    list.push(row.projectId);
    links.set(row.priorityId, list);
  }
  return links;
}

// The links the reader may see, with the project's name: the same project
// access rule as the rest of Kaneo.
async function readableLinks(
  priorityIds: readonly string[],
  reader: PriorityReader,
): Promise<Map<string, ProjectRef[]>> {
  const links = new Map<string, ProjectRef[]>();
  if (priorityIds.length === 0) return links;
  const rows = await db
    .select({
      priorityId: priorityProjectTable.priorityId,
      id: projectTable.id,
      name: projectTable.name,
      slug: projectTable.slug,
    })
    .from(priorityProjectTable)
    .innerJoin(
      projectTable,
      eq(priorityProjectTable.projectId, projectTable.id),
    )
    .where(
      and(
        inArray(priorityProjectTable.priorityId, [...priorityIds]),
        eq(projectTable.workspaceId, reader.workspaceId),
        projectAccessCondition(reader.userId, projectTable.id),
      ),
    )
    .orderBy(asc(projectTable.name), asc(projectTable.id));
  for (const { priorityId, ...project } of rows) {
    const list = links.get(priorityId) ?? [];
    list.push(project);
    links.set(priorityId, list);
  }
  return links;
}

function toResponse(
  row: PriorityRow,
  projects: ProjectRef[] | undefined,
): PriorityResponse {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    parentId: row.parentId,
    title: row.title,
    body: row.body,
    position: row.position,
    status: row.status,
    projects: projects ?? [],
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toAncestor(row: PriorityRow): PriorityAncestor {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    updatedAt: row.updatedAt,
  };
}

/** The workspace's tree, flat and depth first. */
export async function listWorkspacePriorities(
  reader: PriorityReader,
  status: "active" | "all" = "all",
) {
  const rows = inTreeOrder(
    await loadWorkspacePriorities(db, reader.workspaceId),
  ).filter((row) => status === "all" || row.status === "active");
  const links = await readableLinks(
    rows.map((row) => row.id),
    reader,
  );
  return {
    priorities: rows.map((row) => toResponse(row, links.get(row.id))),
  };
}

/**
 * The active priorities linked with the project, in tree order, each with
 * its chain to the root (closed ancestors included, with their status).
 */
export async function listProjectPriorities(
  projectId: string,
  reader: PriorityReader,
) {
  const rows = await loadWorkspacePriorities(db, reader.workspaceId);
  const linked = new Set(
    (
      await db
        .select({ priorityId: priorityProjectTable.priorityId })
        .from(priorityProjectTable)
        .where(eq(priorityProjectTable.projectId, projectId))
    ).map((row) => row.priorityId),
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const shown = inTreeOrder(rows).filter(
    (row) => linked.has(row.id) && row.status === "active",
  );
  const links = await readableLinks(
    shown.map((row) => row.id),
    reader,
  );
  return {
    priorities: shown.map((row) => ({
      ...toResponse(row, links.get(row.id)),
      chain: ancestorsOf(row.id, byId).map(toAncestor),
    })),
  };
}

/** One priority with its chain to the root. */
export async function getPriority(priorityId: string, reader: PriorityReader) {
  const rows = await loadWorkspacePriorities(db, reader.workspaceId);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const row = byId.get(priorityId);
  if (!row) throw new HTTPException(404, { message: "Priority not found" });
  const links = await readableLinks([row.id], reader);
  return {
    ...toResponse(row, links.get(row.id)),
    chain: ancestorsOf(row.id, byId).map(toAncestor),
  };
}

// The log keeps every linked project id; a reader sees only those of the
// projects it can read, the same rule as the links themselves.
function projectIdsOf(fields: Record<string, unknown> | null): string[] {
  const ids = fields?.projectIds;
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string")
    : [];
}

export async function listPriorityChanges(
  priorityId: string,
  limit: number,
  reader: PriorityReader,
) {
  const changes = await db
    .select({
      id: priorityChangeTable.id,
      priorityId: priorityChangeTable.priorityId,
      kind: priorityChangeTable.kind,
      previous: priorityChangeTable.previous,
      value: priorityChangeTable.value,
      changedByUserId: priorityChangeTable.changedByUserId,
      changedByName: userTable.name,
      source: priorityChangeTable.source,
      changedAt: priorityChangeTable.changedAt,
    })
    .from(priorityChangeTable)
    .leftJoin(userTable, eq(priorityChangeTable.changedByUserId, userTable.id))
    .where(eq(priorityChangeTable.priorityId, priorityId))
    .orderBy(desc(priorityChangeTable.changedAt), desc(priorityChangeTable.id))
    .limit(limit);

  const mentioned = [
    ...new Set(
      changes.flatMap((change) => [
        ...projectIdsOf(change.previous),
        ...projectIdsOf(change.value),
      ]),
    ),
  ];
  const readable = new Set(
    mentioned.length === 0
      ? []
      : (
          await db
            .select({ id: projectTable.id })
            .from(projectTable)
            .where(
              and(
                inArray(projectTable.id, mentioned),
                eq(projectTable.workspaceId, reader.workspaceId),
                projectAccessCondition(reader.userId, projectTable.id),
              ),
            )
        ).map((row) => row.id),
  );
  const visible = (fields: Record<string, unknown> | null) =>
    fields && "projectIds" in fields
      ? {
          ...fields,
          projectIds: projectIdsOf(fields).filter((id) => readable.has(id)),
        }
      : fields;
  return {
    changes: changes.map((change) => ({
      ...change,
      previous: visible(change.previous),
      value: visible(change.value) ?? change.value,
    })),
  };
}
