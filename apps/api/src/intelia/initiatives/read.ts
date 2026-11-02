import { and, asc, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../../database";
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
import { getInitiative, listProjectInitiatives } from "./service";

// The factory's column slugs (design 19 §5): only Done is done, Cancelled is
// out of the progress, Blocked carries a reason. Both spellings of Cancelled,
// as in the «Dependencias» view.
const DONE = "done";
const CANCELLED = new Set(["cancelled", "canceled"]);
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

type MemberTask = Awaited<ReturnType<typeof readableMemberTasks>>[number];

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
async function blockReasons(
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

function countTasks(tasks: { status: string; origin: TaskOrigin }[]) {
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

function summarize(tasks: MemberTask[]) {
  const counters = countTasks(tasks);
  return { state: stateOf(counters), counters };
}

/** GET …/project/{projectId}/initiatives: every initiative with its counters. */
export async function listInitiativesWithCounters(
  projectId: string,
  reader: InitiativeReader,
) {
  const [initiatives, tasks, withoutInitiative] = await Promise.all([
    listProjectInitiatives(projectId),
    readableMemberTasks(
      reader,
      inArray(
        taskInitiativeTable.initiativeId,
        db
          .select({ id: initiativeTable.id })
          .from(initiativeTable)
          .where(eq(initiativeTable.projectId, projectId)),
      ),
    ),
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
  const byInitiative = new Map<string, MemberTask[]>();
  for (const task of tasks) {
    const group = byInitiative.get(task.initiativeId);
    if (group) group.push(task);
    else byInitiative.set(task.initiativeId, [task]);
  }
  return {
    initiatives: initiatives.map((initiative) => {
      const own = byInitiative.get(initiative.id) ?? [];
      return {
        ...initiative,
        ...summarize(own),
        blockedTasks: own
          .filter((task) => task.status === BLOCKED)
          .map((task) => ({
            id: task.id,
            number: task.number,
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
  const [initiative, tasks] = await Promise.all([
    getInitiative(initiativeId),
    readableMemberTasks(
      reader,
      eq(taskInitiativeTable.initiativeId, initiativeId),
    ),
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
    ...summarize(tasks),
    tasks: tasks.map((task) => ({
      id: task.id,
      number: task.number,
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
