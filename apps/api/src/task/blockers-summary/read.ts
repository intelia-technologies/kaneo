import { eq, inArray, type SQL, sql } from "drizzle-orm";
import {
  labelTable,
  projectTable,
  taskRelationTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { executorKind } from "../../intelia/initiatives/plan/executor";
import {
  boardSignalTable,
  taskAutomationTable,
  taskClassificationTable,
} from "../../intelia/schema";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import type { TaskReadDatabase } from "../bounded-read";
import { type ChainNode, findRoot, MAX_ROOT_DEPTH } from "./root";
import type { BlockerItem, BlockersSummary, BlockerState } from "./schema";
import {
  type BlockerFacts,
  blockerPerson,
  blockerState,
  notStartingReason,
  worstReason,
} from "./state";

/** Who reads: the board's workspace and how its other projects are seen. */
export type SummaryReader = {
  workspaceId: string;
  publicOnly: boolean;
  userId?: string;
};

type EdgeRow = {
  targetId: string;
  id: string;
  number: number | null;
  title: string;
  status: string;
  priority: string;
  createdAt: Date | string;
  slug: string;
  visible: boolean;
  email: string | null;
  assigneeName: string | null;
  decision: boolean;
  esperaA: string | null;
};

// Hidden projects contribute only an anonymous, conservatively pending edge,
// never their task status, title or chain.
function visibleProject(reader: SummaryReader): SQL<boolean> {
  if (reader.publicOnly)
    return sql<boolean>`(${projectTable.workspaceId} = ${reader.workspaceId} and ${projectTable.isPublic} = true)`;
  if (reader.userId)
    return sql<boolean>`(${projectTable.workspaceId} = ${reader.workspaceId} and ${projectAccessCondition(reader.userId, projectTable.id)})`;
  return sql<boolean>`false`;
}

/** What each task needs besides its blockers: start conditions. */
async function seedFacts(db: TaskReadDatabase, taskIds: string[]) {
  return db
    .select({
      id: taskTable.id,
      status: taskTable.status,
      type: taskClassificationTable.type,
      releaseDeployed: sql<boolean>`exists (
        select 1 from custom_field_value v
        join custom_field_definition d on d.id = v.field_id
        where v.task_id = ${taskTable.id} and d.project_id = ${taskTable.projectId}
          and d.name = 'release' and v.value = 'desplegada'
      )`,
      automatica: taskAutomationTable.automatica,
      pausaMotivo: taskAutomationTable.pausaMotivo,
      email: userTable.email,
    })
    .from(taskTable)
    .leftJoin(userTable, eq(taskTable.userId, userTable.id))
    .leftJoin(
      taskClassificationTable,
      eq(taskClassificationTable.taskId, taskTable.id),
    )
    .leftJoin(taskAutomationTable, eq(taskAutomationTable.taskId, taskTable.id))
    .where(inArray(taskTable.id, taskIds));
}

/**
 * One query: the direct blockers of every task, and for the To do ones the
 * pending chain behind them, recursive and bounded to the root's depth. Done
 * tasks end a branch; hidden and cancelled ones are returned but not expanded.
 */
async function edges(
  db: TaskReadDatabase,
  taskIds: string[],
  todoIds: string[],
  reader: SummaryReader,
) {
  const visible = visibleProject(reader);
  const result = await db.execute<EdgeRow>(sql`
    with recursive reach(id, depth) as (
      select seed.id, 0 from unnest(${sql.param(todoIds)}::text[]) as seed(id)
      union
      select ${taskRelationTable.sourceTaskId}, reach.depth + 1
      from reach
      join ${taskRelationTable} on ${taskRelationTable.targetTaskId} = reach.id
        and ${taskRelationTable.relationType} = 'blocks'
      join ${taskTable} on ${taskTable.id} = ${taskRelationTable.sourceTaskId}
      join ${projectTable} on ${projectTable.id} = ${taskTable.projectId}
      where reach.depth < ${MAX_ROOT_DEPTH}
        and ${taskTable.status} not in ('done', 'cancelled', 'canceled')
        and ${visible}
    ),
    targets(id) as (
      select id from reach
      union
      select unnest(${sql.param(taskIds)}::text[])
    )
    select
      ${taskRelationTable.targetTaskId} as "targetId",
      ${taskTable.id} as "id",
      ${taskTable.number} as "number",
      ${taskTable.title} as "title",
      ${taskTable.status} as "status",
      ${taskTable.priority} as "priority",
      ${taskTable.createdAt} as "createdAt",
      ${projectTable.slug} as "slug",
      ${visible} as "visible",
      ${userTable.email} as "email",
      ${userTable.name} as "assigneeName",
      exists (
        select 1 from ${labelTable}
        where ${labelTable.taskId} = ${taskTable.id}
          and lower(${labelTable.name}) = 'decision'
      ) as "decision",
      -- Only a Blocked task's wait matters; this skips reading the signals
      -- document for every other blocker.
      case when ${taskTable.status} = 'blocked' then (
        select ${boardSignalTable.signals} -> 'tareas' -> ${taskTable.id} ->> 'espera_a'
        from ${boardSignalTable}
        where ${boardSignalTable.projectId} = ${taskTable.projectId}
      ) end as "esperaA"
    from ${taskRelationTable}
    join ${taskTable} on ${taskTable.id} = ${taskRelationTable.sourceTaskId}
    join ${projectTable} on ${projectTable.id} = ${taskTable.projectId}
    left join ${userTable} on ${userTable.id} = ${taskTable.userId}
    where ${taskRelationTable.relationType} = 'blocks'
      and ${taskRelationTable.targetTaskId} in (select id from targets)
  `);
  return result.rows;
}

function blockerItem(row: EdgeRow, publicOnly: boolean): BlockerItem {
  const facts: BlockerFacts = {
    status: row.status,
    assigneeKind: executorKind(row.email),
    assigneeName: row.assigneeName,
    hasDecisionLabel: row.decision,
    esperaA: row.esperaA,
  };
  const state = blockerState(facts);
  return {
    id: row.id,
    ticket: `${row.slug}-${row.number}`,
    status: row.status,
    title: row.title,
    state,
    person: state === "person" && !publicOnly ? blockerPerson(facts) : null,
  };
}

/** Design 55 §3.1: the blockers summary of each task, by id. */
export async function readBlockersSummaries(
  db: TaskReadDatabase,
  taskIds: string[],
  reader: SummaryReader,
): Promise<Map<string, BlockersSummary>> {
  const summaries = new Map<string, BlockersSummary>();
  if (taskIds.length === 0) return summaries;
  const seeds = await seedFacts(db, taskIds);
  const todoIds = seeds
    .filter((task) => task.status === "to-do")
    .map((task) => task.id);
  const rows = await edges(db, taskIds, todoIds, reader);

  // Pending blockers by target; a hidden one never reveals whether it is Done.
  const blockersOf = new Map<string, ChainNode[]>();
  const rowsOf = new Map<string, EdgeRow[]>();
  const items = new Map<string, BlockerItem>();
  for (const row of rows) {
    if (row.visible && row.status === "done") continue;
    const node: ChainNode = row.visible
      ? {
          id: row.id,
          visible: true,
          status: row.status,
          priority: row.priority,
          createdAt: new Date(row.createdAt),
        }
      : {
          id: row.id,
          visible: false,
          status: "",
          priority: "",
          createdAt: new Date(0),
        };
    const nodes = blockersOf.get(row.targetId);
    if (nodes) nodes.push(node);
    else blockersOf.set(row.targetId, [node]);
    const targetRows = rowsOf.get(row.targetId);
    if (targetRows) targetRows.push(row);
    else rowsOf.set(row.targetId, [row]);
    if (row.visible && !items.has(row.id))
      items.set(row.id, blockerItem(row, reader.publicOnly));
  }

  for (const seed of seeds) {
    const byState: Record<BlockerState, number> = {
      in_progress: 0,
      not_started: 0,
      blocked: 0,
      person: 0,
      cancelled: 0,
    };
    const blockers: BlockerItem[] = [];
    let externalCount = 0;
    for (const row of rowsOf.get(seed.id) ?? []) {
      const item = items.get(row.id);
      if (!row.visible || !item) {
        externalCount++;
        continue;
      }
      byState[item.state]++;
      blockers.push(item);
    }
    const pendingCount = blockers.length + externalCount;
    const waitingRelease =
      seed.type === "validacion" && pendingCount === 0 && !seed.releaseDeployed;
    const isTodo = seed.status === "to-do";
    // Automation settings are internal: a public board does not show them.
    const reason =
      isTodo && pendingCount === 0 && !reader.publicOnly
        ? notStartingReason({
            automatica: seed.automatica,
            pausaMotivo: seed.pausaMotivo,
            assigneeKind: executorKind(seed.email),
            waitingRelease,
          })
        : null;
    const root =
      isTodo && pendingCount > 0 ? findRoot(seed.id, blockersOf) : null;
    summaries.set(seed.id, {
      pendingCount,
      hasCancelledBlocker: byState.cancelled > 0,
      waitingRelease,
      blockers,
      externalCount,
      byState,
      reason: worstReason(
        blockers.map((item) => item.state),
        externalCount,
      ),
      notStartingReason: reason,
      pauseReason: reason === "paused" ? seed.pausaMotivo : null,
      root: root && {
        kind: root.kind,
        task:
          root.kind === "task" && root.nodeId
            ? (items.get(root.nodeId) ?? null)
            : null,
        depth: root.depth,
      },
    });
  }
  return summaries;
}
