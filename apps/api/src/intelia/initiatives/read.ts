import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  not,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../../database";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import {
  customFieldDefinitionTable,
  customFieldValueTable,
  projectTable,
  taskRelationTable,
  taskTable,
  userTable,
} from "../../database/schema";
import {
  initiativeTable,
  type TaskOrigin,
  taskInitiativeTable,
} from "../schema";
import { statusSince } from "../status-since";
import { type InitiativeReader, readableProject } from "./access";
import { CANCELLED, getInitiative, listProjectInitiatives } from "./service";

// The factory's column slugs (design 19 §5): only Done is done, Cancelled
// (CANCELLED) is out of the progress, Blocked carries a reason.
const DONE = "done";
const BLOCKED = "blocked";

// Custom fields with the reason of a block: the dropdown and, from IN-07, its
// short text.
const BLOCK_REASON_FIELD = "motivo_bloqueo";
const BLOCK_REASON_DETAIL_FIELD = "motivo_bloqueo_detalle";

const assigneeUser = alias(userTable, "initiative_task_assignee");

/** Tasks in initiatives matching `where`, only of projects the reader can read. */
function readableMemberTasks(reader: InitiativeReader, where: SQL) {
  return db
    .select({
      id: taskTable.id,
      number: taskTable.number,
      title: taskTable.title,
      status: taskTable.status,
      projectId: taskTable.projectId,
      projectSlug: projectTable.slug,
      assigneeId: taskTable.userId,
      assigneeName: assigneeUser.name,
      statusSince,
      initiativeId: taskInitiativeTable.initiativeId,
      origin: taskInitiativeTable.origin,
      since: taskInitiativeTable.since,
    })
    .from(taskInitiativeTable)
    .innerJoin(taskTable, eq(taskInitiativeTable.taskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(assigneeUser, eq(taskTable.userId, assigneeUser.id))
    .where(and(where, readableProject(reader)))
    .orderBy(asc(taskTable.number), asc(taskTable.id));
}

/**
 * Status and origin of the tasks in initiatives matching `where` that the
 * reader cannot read, nothing else: they count, anonymized (design 52 §3.1).
 * Only tasks of the reader's workspace, so a stray row of another one never
 * counts. Exactly the complement of `readableMemberTasks` in that workspace.
 */
function hiddenMemberTasks(reader: InitiativeReader, where: SQL) {
  return db
    .select({
      initiativeId: taskInitiativeTable.initiativeId,
      status: taskTable.status,
      origin: taskInitiativeTable.origin,
    })
    .from(taskInitiativeTable)
    .innerJoin(taskTable, eq(taskInitiativeTable.taskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        where,
        eq(projectTable.workspaceId, reader.workspaceId),
        not(readableProject(reader)!),
      ),
    );
}

type CountedTask = { status: string; origin: TaskOrigin };

function assigneeOf(task: {
  assigneeId: string | null;
  assigneeName: string | null;
}) {
  return task.assigneeId
    ? { id: task.assigneeId, name: task.assigneeName }
    : null;
}

type BlockReason = {
  blockReason: string | null;
  blockReasonDetail: string | null;
};

// Reasons of the Blocked tasks among `tasks`, already readable.
export async function blockReasons(
  tasks: { id: string; status: string }[],
): Promise<Map<string, BlockReason>> {
  const blockedIds = tasks.filter((t) => t.status === BLOCKED).map((t) => t.id);
  const reasons = new Map<string, BlockReason>(
    blockedIds.map((id) => [
      id,
      { blockReason: null, blockReasonDetail: null },
    ]),
  );
  if (blockedIds.length === 0) return reasons;
  const rows = await db
    .select({
      taskId: customFieldValueTable.taskId,
      name: customFieldDefinitionTable.name,
      value: customFieldValueTable.value,
    })
    .from(customFieldValueTable)
    .innerJoin(
      customFieldDefinitionTable,
      eq(customFieldValueTable.fieldId, customFieldDefinitionTable.id),
    )
    .where(
      and(
        inArray(customFieldValueTable.taskId, blockedIds),
        inArray(customFieldDefinitionTable.name, [
          BLOCK_REASON_FIELD,
          BLOCK_REASON_DETAIL_FIELD,
        ]),
      ),
    );
  for (const row of rows) {
    const reason = reasons.get(row.taskId);
    const value = row.value?.trim() || null;
    if (!reason || !value) continue;
    if (row.name === BLOCK_REASON_FIELD) reason.blockReason = value;
    else reason.blockReasonDetail = value;
  }
  return reasons;
}

const ORIGIN_KEY: Record<TaskOrigin, "plan" | "added" | "unrecorded"> = {
  plan: "plan",
  añadido: "added",
  sin_registro: "unrecorded",
};

function countTasks(tasks: CountedTask[]) {
  const tally = () => ({ total: 0, active: 0, done: 0 });
  const counters = {
    total: 0,
    active: 0,
    done: 0,
    cancelled: 0,
    blocked: 0,
    plan: tally(),
    added: tally(),
    unrecorded: tally(),
    hidden: tally(),
  };
  for (const task of tasks) {
    const byOrigin = counters[ORIGIN_KEY[task.origin]];
    counters.total++;
    byOrigin.total++;
    if (CANCELLED.has(task.status)) {
      counters.cancelled++;
      continue;
    }
    counters.active++;
    byOrigin.active++;
    if (task.status === DONE) {
      counters.done++;
      byOrigin.done++;
    }
    if (task.status === BLOCKED) counters.blocked++;
  }
  return counters;
}

type Counters = ReturnType<typeof countTasks>;

function stateOf(counters: Counters) {
  if (counters.total === 0) return "no_tasks" as const;
  if (counters.active === 0) return "all_cancelled" as const;
  if (counters.done === counters.active) return "finished" as const;
  return "in_flight" as const;
}

// Every task counts; the hidden ones also go to their own tally, so the view
// can say how many it cannot show.
function summarize(readable: CountedTask[], hidden: CountedTask[]) {
  const counters = countTasks([...readable, ...hidden]);
  const { total, active, done } = countTasks(hidden);
  counters.hidden = { total, active, done };
  return { state: stateOf(counters), counters };
}

function groupByInitiative<T extends { initiativeId: string }>(tasks: T[]) {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const group = groups.get(task.initiativeId);
    if (group) group.push(task);
    else groups.set(task.initiativeId, [task]);
  }
  return groups;
}

/** GET …/project/{projectId}/initiatives: every initiative with its counters. */
export async function listInitiativesWithCounters(
  projectId: string,
  reader: InitiativeReader,
) {
  const ofProject = inArray(
    taskInitiativeTable.initiativeId,
    db
      .select({ id: initiativeTable.id })
      .from(initiativeTable)
      .where(eq(initiativeTable.projectId, projectId)),
  );
  const [initiatives, tasks, hidden, withoutInitiative] = await Promise.all([
    listProjectInitiatives(projectId),
    readableMemberTasks(reader, ofProject),
    hiddenMemberTasks(reader, ofProject),
    db
      .select({
        id: taskTable.id,
        number: taskTable.number,
        title: taskTable.title,
        status: taskTable.status,
        assigneeId: taskTable.userId,
        assigneeName: assigneeUser.name,
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .leftJoin(
        taskInitiativeTable,
        eq(taskInitiativeTable.taskId, taskTable.id),
      )
      .leftJoin(assigneeUser, eq(taskTable.userId, assigneeUser.id))
      .where(
        and(
          eq(taskTable.projectId, projectId),
          isNull(taskInitiativeTable.taskId),
          readableProject(reader),
        ),
      )
      .orderBy(asc(taskTable.number), asc(taskTable.id)),
  ]);

  const reasons = await blockReasons(tasks);
  const byInitiative = groupByInitiative(tasks);
  const hiddenByInitiative = groupByInitiative(hidden);
  return {
    initiatives: initiatives.map((initiative) => {
      const own = byInitiative.get(initiative.id) ?? [];
      return {
        ...initiative,
        ...summarize(own, hiddenByInitiative.get(initiative.id) ?? []),
        blockedTasks: own
          .filter((task) => task.status === BLOCKED)
          .map((task) => ({
            id: task.id,
            number: task.number,
            projectSlug: task.projectSlug,
            title: task.title,
            assignee: assigneeOf(task),
            statusSince: task.statusSince,
            ...reasons.get(task.id)!,
          })),
      };
    }),
    withoutInitiative: withoutInitiative.map((task) => ({
      id: task.id,
      number: task.number,
      title: task.title,
      status: task.status,
      assignee: assigneeOf(task),
    })),
  };
}

const isPending = (status: string) => status !== DONE && !CANCELLED.has(status);

// The longest chain of pending tasks along `blocks` edges (blocker → blocked);
// ties go to the earliest node in `nodes`, start and successors alike. Null
// with a cycle.
function longestPendingChain(
  nodes: string[],
  edges: { from: string; to: string }[],
): string[] | null {
  const order = new Map(nodes.map((id, index) => [id, index]));
  const next = new Map<string, string[]>(nodes.map((id) => [id, []]));
  for (const edge of edges) next.get(edge.from)?.push(edge.to);
  for (const list of next.values()) {
    list.sort((a, b) => order.get(a)! - order.get(b)!);
  }
  const best = new Map<string, string[]>();
  const visiting = new Set<string>();
  const walk = (id: string): string[] | null => {
    const known = best.get(id);
    if (known) return known;
    if (visiting.has(id)) return null;
    visiting.add(id);
    let tail: string[] = [];
    for (const to of next.get(id) ?? []) {
      const chain = walk(to);
      if (!chain) return null;
      if (chain.length > tail.length) tail = chain;
    }
    visiting.delete(id);
    const chain = [id, ...tail];
    best.set(id, chain);
    return chain;
  };
  let longest: string[] = [];
  for (const id of nodes) {
    const chain = walk(id);
    if (!chain) return null;
    if (chain.length > longest.length) longest = chain;
  }
  return longest;
}

/** GET …/initiative/{initiativeId}: the initiative, its tasks and dependencies. */
export async function getInitiativeDetail(
  initiativeId: string,
  reader: InitiativeReader,
) {
  const ofInitiative = eq(taskInitiativeTable.initiativeId, initiativeId);
  const [initiative, tasks, hidden] = await Promise.all([
    getInitiative(initiativeId),
    readableMemberTasks(reader, ofInitiative),
    hiddenMemberTasks(reader, ofInitiative),
  ]);
  const own = new Set(tasks.map((task) => task.id));
  const ownIds = [...own];

  const relations =
    ownIds.length === 0
      ? []
      : await db
          .selectDistinct({
            from: taskRelationTable.sourceTaskId,
            to: taskRelationTable.targetTaskId,
          })
          .from(taskRelationTable)
          .where(
            and(
              eq(taskRelationTable.relationType, "blocks"),
              or(
                inArray(taskRelationTable.sourceTaskId, ownIds),
                inArray(taskRelationTable.targetTaskId, ownIds),
              ),
            ),
          );

  // Endpoints outside the initiative, through the same filter.
  const outsideIds = [
    ...new Set(relations.flatMap((r) => [r.from, r.to])),
  ].filter((id) => !own.has(id));
  const externalTasks =
    outsideIds.length === 0
      ? []
      : await db
          .select({
            id: taskTable.id,
            number: taskTable.number,
            title: taskTable.title,
            status: taskTable.status,
            projectId: taskTable.projectId,
            projectSlug: projectTable.slug,
            projectName: projectTable.name,
            initiativeId: taskInitiativeTable.initiativeId,
          })
          .from(taskTable)
          .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
          .leftJoin(
            taskInitiativeTable,
            eq(taskInitiativeTable.taskId, taskTable.id),
          )
          .where(
            and(inArray(taskTable.id, outsideIds), readableProject(reader)),
          )
          .orderBy(asc(projectTable.slug), asc(taskTable.number));

  const status = new Map<string, string>([
    ...tasks.map((t) => [t.id, t.status] as const),
    ...externalTasks.map((t) => [t.id, t.status] as const),
  ]);
  const visible = relations.filter(
    (r) => status.has(r.from) && status.has(r.to),
  );
  // A hidden endpoint is never read: only the existence of the relation, seen
  // from a pending task of the initiative, marks the chain partial.
  const partial = relations.some(
    (r) =>
      !(status.has(r.from) && status.has(r.to)) &&
      [r.from, r.to].some((id) => own.has(id) && isPending(status.get(id)!)),
  );

  const pendingNodes = [...tasks, ...externalTasks]
    .filter((t) => isPending(t.status))
    .map((t) => t.id);
  const chain = longestPendingChain(
    pendingNodes,
    visible.filter(
      (r) => isPending(status.get(r.from)!) && isPending(status.get(r.to)!),
    ),
  );

  const reasons = await blockReasons(tasks);
  return {
    ...initiative,
    ...summarize(tasks, hidden),
    tasks: tasks.map((task) => ({
      id: task.id,
      number: task.number,
      projectId: task.projectId,
      projectSlug: task.projectSlug,
      title: task.title,
      status: task.status,
      origin: task.origin,
      since: task.since,
      assignee: assigneeOf(task),
      statusSince: task.statusSince,
      blockReason: reasons.get(task.id)?.blockReason ?? null,
      blockReasonDetail: reasons.get(task.id)?.blockReasonDetail ?? null,
      dependsOn: visible.filter((r) => r.to === task.id).map((r) => r.from),
      blocks: visible.filter((r) => r.from === task.id).map((r) => r.to),
    })),
    externalTasks,
    pendingChain: {
      taskIds: chain ?? [],
      partial,
      cycle: chain === null,
    },
  };
}

/**
 * The initiative of each of `taskIds` the reader can read, in one query.
 * Tasks it cannot read, of other workspaces or unknown are left out. The
 * initiative may be of another project: its name only if that one is
 * readable too (design 52 §3.1).
 */
export async function getTaskInitiatives(
  taskIds: string[],
  reader: InitiativeReader,
) {
  const tasks = await db
    .select({
      taskId: taskTable.id,
      initiativeId: initiativeTable.id,
      initiativeName: sql<
        string | null
      >`CASE WHEN ${projectAccessCondition(reader.userId, initiativeTable.projectId)} THEN ${initiativeTable.name} END`,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(taskInitiativeTable, eq(taskInitiativeTable.taskId, taskTable.id))
    .leftJoin(
      initiativeTable,
      eq(taskInitiativeTable.initiativeId, initiativeTable.id),
    )
    .where(
      and(
        inArray(taskTable.id, [...new Set(taskIds)]),
        readableProject(reader),
      ),
    )
    .orderBy(asc(taskTable.id));
  return { tasks };
}

/**
 * GET …/project/{projectId}/initiative-options: the initiatives a task of the
 * project can join (design 52 §3.1), those of every project of its workspace
 * the reader can read, with their project, by project and name.
 */
export async function listInitiativeOptions(reader: InitiativeReader) {
  const initiatives = await db
    .select({
      id: initiativeTable.id,
      name: initiativeTable.name,
      planClosedAt: initiativeTable.planClosedAt,
      projectId: projectTable.id,
      projectSlug: projectTable.slug,
      projectName: projectTable.name,
    })
    .from(initiativeTable)
    .innerJoin(projectTable, eq(initiativeTable.projectId, projectTable.id))
    .where(readableProject(reader))
    .orderBy(asc(projectTable.slug), asc(initiativeTable.name));
  return { initiatives };
}
