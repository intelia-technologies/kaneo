import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import db from "../../database";
import {
  externalLinkTable,
  projectTable,
  taskRelationTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import { routineTable, taskAutomationTable } from "../schema";
import type { Transaction } from "../task-automation/service";
import { parseTicket, ticketOf } from "./keys";
import type { Graph, GraphRelation, GraphTask } from "./types";

type Executor = typeof db | Transaction;

const CLOSED = ["done", "cancelled", "canceled"];
const WORK_STATUSES = ["in-progress", "in-review", "ready-to-merge"];

// Far above any real chain (28 nodes on 17-11): a guard, not a limit.
const MAX_NODES = 5000;

/** Tasks by id with what the chain shows, as `viewerId` sees their projects. */
export async function loadTasks(
  ex: Executor,
  ids: string[],
  viewerId: string,
): Promise<Map<string, GraphTask>> {
  if (!ids.length) return new Map();
  // A task with a worker or an open pull request is under way (§4.2).
  const openPullRequest = sql<boolean>`exists (
    select 1 from ${externalLinkTable}
    where ${externalLinkTable.taskId} = ${taskTable.id}
      and ${externalLinkTable.resourceType} = 'pull_request'
      and coalesce(${externalLinkTable.metadata}, '') !~ '"state"\\s*:\\s*"(closed|merged)"'
  )`;
  const rows = await ex
    .select({
      id: taskTable.id,
      projectId: taskTable.projectId,
      projectSlug: projectTable.slug,
      number: taskTable.number,
      title: taskTable.title,
      status: taskTable.status,
      columnId: taskTable.columnId,
      userId: taskTable.userId,
      assigneeName: userTable.name,
      automatica: taskAutomationTable.automatica,
      responsable: taskAutomationTable.responsable,
      routineActive: sql<boolean>`coalesce(${routineTable.active}, false)`,
      enCurso: sql<boolean>`(${inArray(taskTable.status, WORK_STATUSES)} or ${openPullRequest})`,
      visible: projectAccessCondition(viewerId, taskTable.projectId),
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(userTable, eq(taskTable.userId, userTable.id))
    .leftJoin(taskAutomationTable, eq(taskAutomationTable.taskId, taskTable.id))
    .leftJoin(routineTable, eq(routineTable.taskId, taskTable.id))
    .where(inArray(taskTable.id, ids));
  return new Map(
    rows.map((r) => [
      r.id,
      {
        ...r,
        number: r.number ?? 0,
        ticket: ticketOf(r.projectSlug, r.number),
        automatica: r.automatica ?? null,
        responsable: r.responsable ?? null,
        assigneeName: r.assigneeName ?? null,
      },
    ]),
  );
}

/**
 * Walks forward from the root through `blocks` relations (§4.1), one query per
 * level: open dependents only, each once, and only down through tasks of the
 * root's board (decision 9). Inside a transaction it sees what is committed.
 */
export async function loadGraph(
  ex: Executor,
  rootId: string,
  viewerId: string,
): Promise<Graph | null> {
  const [rootRow] = await ex
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, rootId));
  if (!rootRow) return null;

  const reached = new Set([rootId]);
  const relations: GraphRelation[] = [];
  let frontier = [rootId];
  while (frontier.length && reached.size <= MAX_NODES) {
    const rows = await ex
      .select({
        id: taskRelationTable.id,
        source: taskRelationTable.sourceTaskId,
        target: taskRelationTable.targetTaskId,
        projectId: taskTable.projectId,
      })
      .from(taskRelationTable)
      .innerJoin(taskTable, eq(taskRelationTable.targetTaskId, taskTable.id))
      .where(
        and(
          eq(taskRelationTable.relationType, "blocks"),
          inArray(taskRelationTable.sourceTaskId, frontier),
          notInArray(taskTable.status, CLOSED),
        ),
      )
      .orderBy(taskRelationTable.id);
    const next: string[] = [];
    for (const row of rows) {
      if (row.target === rootId) continue;
      relations.push({ id: row.id, source: row.source, target: row.target });
      if (reached.has(row.target)) continue;
      reached.add(row.target);
      if (row.projectId === rootRow.projectId) next.push(row.target);
    }
    frontier = next;
  }

  const tasks = await loadTasks(ex, [...reached], viewerId);
  const root = tasks.get(rootId);
  return root ? { root, tasks, relations } : null;
}

/**
 * The `blocks` relations reachable forward from `from`, by key: what a
 * `mover` must not loop through (decision 13).
 */
export async function loadForwardEdges(ex: Executor, from: string[]) {
  const edges: { id: string; source: string; target: string }[] = [];
  const seen = new Set(from);
  let frontier = from;
  while (frontier.length && seen.size <= MAX_NODES) {
    const rows = await ex
      .select({
        id: taskRelationTable.id,
        source: taskRelationTable.sourceTaskId,
        target: taskRelationTable.targetTaskId,
      })
      .from(taskRelationTable)
      .where(
        and(
          eq(taskRelationTable.relationType, "blocks"),
          inArray(taskRelationTable.sourceTaskId, frontier),
        ),
      );
    frontier = [];
    for (const row of rows) {
      edges.push(row);
      if (!seen.has(row.target)) {
        seen.add(row.target);
        frontier.push(row.target);
      }
    }
  }
  const keys = await ex
    .select({
      id: taskTable.id,
      slug: projectTable.slug,
      number: taskTable.number,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(inArray(taskTable.id, [...seen]));
  const ticket = new Map(keys.map((k) => [k.id, ticketOf(k.slug, k.number)]));
  return edges.map((e) => ({
    id: e.id,
    source: ticket.get(e.source) ?? e.source,
    target: ticket.get(e.target) ?? e.target,
  }));
}

/**
 * Tasks of the workspace by key, as `viewerId` may use them as a `mover`
 * target: one it cannot read does not exist for it.
 */
export async function loadTargets(
  ex: Executor,
  workspaceId: string,
  tickets: string[],
  viewerId: string,
) {
  const found = new Map<string, { id: string; status: string } | null>(
    tickets.map((t) => [t, null]),
  );
  const keys = tickets.flatMap((t) => parseTicket(t) ?? []);
  if (!keys.length) return found;
  const rows = await ex
    .select({
      id: taskTable.id,
      slug: projectTable.slug,
      number: taskTable.number,
      status: taskTable.status,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        inArray(
          projectTable.slug,
          keys.map((k) => k.slug),
        ),
        inArray(
          taskTable.number,
          keys.map((k) => k.number),
        ),
        projectAccessCondition(viewerId, taskTable.projectId),
      ),
    );
  for (const r of rows) {
    const ticket = ticketOf(r.slug, r.number);
    if (found.has(ticket)) found.set(ticket, { id: r.id, status: r.status });
  }
  return found;
}
