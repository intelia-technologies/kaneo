import { and, asc, eq, inArray } from "drizzle-orm";
import db from "../../../database";
import {
  activityTable,
  customFieldDefinitionTable,
  customFieldValueTable,
  projectTable,
  taskTable,
  userTable,
} from "../../../database/schema";
import { taskAutomationTable } from "../../schema";
import { columnStats } from "../../status-age/read";
import { type InitiativeReader, readableProject } from "../access";
import { getInitiativeDetail } from "../read";
import { estimateHours, parseManualHours, remainingHours } from "./estimate";
import { executorKind } from "./executor";
import { type StatusChange, taskHistory } from "./history";
import { type PlanMark, planMark } from "./mark";
import { plainParagraph } from "./plain";
import { workspaceSamples } from "./samples";
import { buildSchedule, type ScheduleNode } from "./schedule";

// The manual estimate (annex of design 19 §3.3), a custom field of the task.
const MANUAL_ESTIMATE_FIELD = "estimacion_horas";

const isPending = (status: string) =>
  status !== "done" && status !== "cancelled" && status !== "canceled";

const round = (hours: number) => Math.round(hours * 10) / 10;

// What the plan needs of each task beyond the initiative detail, for tasks
// the detail already filtered as readable.
async function taskFacts(ids: string[]) {
  if (ids.length === 0) return { rows: [], manual: new Map(), changes: [] };
  const [rows, manualRows, changes] = await Promise.all([
    db
      .select({
        id: taskTable.id,
        projectId: taskTable.projectId,
        createdAt: taskTable.createdAt,
        description: taskTable.description,
        email: userTable.email,
        level: taskAutomationTable.level,
      })
      .from(taskTable)
      .leftJoin(userTable, eq(taskTable.userId, userTable.id))
      .leftJoin(
        taskAutomationTable,
        eq(taskAutomationTable.taskId, taskTable.id),
      )
      .where(inArray(taskTable.id, ids)),
    db
      .select({
        taskId: customFieldValueTable.taskId,
        value: customFieldValueTable.value,
      })
      .from(customFieldValueTable)
      .innerJoin(
        customFieldDefinitionTable,
        eq(customFieldValueTable.fieldId, customFieldDefinitionTable.id),
      )
      .where(
        and(
          inArray(customFieldValueTable.taskId, ids),
          eq(customFieldDefinitionTable.name, MANUAL_ESTIMATE_FIELD),
        ),
      ),
    db
      .select({
        taskId: activityTable.taskId,
        at: activityTable.createdAt,
        eventData: activityTable.eventData,
      })
      .from(activityTable)
      .where(
        and(
          inArray(activityTable.taskId, ids),
          eq(activityTable.type, "status_changed"),
        ),
      )
      .orderBy(asc(activityTable.createdAt), asc(activityTable.id)),
  ]);
  const manual = new Map<string, number>();
  for (const row of manualRows) {
    const hours = parseManualHours(row.value);
    if (hours !== null) manual.set(row.taskId, hours);
  }
  return { rows, manual, changes };
}

/** GET …/initiative/{initiativeId}/plan (annex of design 19 §3.1-§3.3). */
export async function getInitiativePlan(
  initiativeId: string,
  reader: InitiativeReader,
) {
  const now = new Date(Date.now());
  const detail = await getInitiativeDetail(initiativeId, reader);
  const tasks = [
    ...detail.tasks.map((task) => ({ ...task, external: false })),
    ...detail.externalTasks.map((task) => ({
      ...task,
      external: true,
      assignee: null,
      statusSince: null,
      blockReason: null,
      blockReasonDetail: null,
    })),
  ];
  const ids = tasks.map((task) => task.id);

  const [facts, readableRows, cached] = await Promise.all([
    taskFacts(ids),
    db
      .select({ id: projectTable.id })
      .from(projectTable)
      .where(readableProject(reader)),
    workspaceSamples(reader.workspaceId),
  ]);
  // Estimates learn only from tasks the reader can read (§3.6).
  const readable = new Set(readableRows.map((row) => row.id));
  const samples = cached.samples.filter((s) => readable.has(s.projectId));

  const factsById = new Map(facts.rows.map((row) => [row.id, row]));
  const changesById = new Map<string, StatusChange[]>();
  for (const change of facts.changes) {
    const data = (change.eventData ?? {}) as Record<string, unknown>;
    const list = changesById.get(change.taskId) ?? [];
    list.push({
      at: change.at,
      oldStatus: typeof data.oldStatus === "string" ? data.oldStatus : null,
      newStatus: typeof data.newStatus === "string" ? data.newStatus : null,
    });
    changesById.set(change.taskId, list);
  }

  // Edges among readable tasks, as the detail exposes them.
  const edges = new Map<string, { from: string; to: string }>();
  for (const task of detail.tasks) {
    for (const from of task.dependsOn) {
      edges.set(`${from}>${task.id}`, { from, to: task.id });
    }
    for (const to of task.blocks) {
      edges.set(`${task.id}>${to}`, { from: task.id, to });
    }
  }
  const status = new Map(tasks.map((task) => [task.id, task.status]));
  const blockersOf = new Map<string, string[]>();
  for (const { from, to } of edges.values()) {
    blockersOf.set(to, [...(blockersOf.get(to) ?? []), from]);
  }

  const pendingProjects = [
    ...new Set(
      tasks
        .filter((task) => isPending(task.status))
        .map((task) => factsById.get(task.id)!.projectId),
    ),
  ];
  const stats = new Map(
    await Promise.all(
      pendingProjects.map(
        async (projectId) => [projectId, await columnStats(projectId)] as const,
      ),
    ),
  );

  const planned = tasks.map((task) => {
    const fact = factsById.get(task.id)!;
    const pending = isPending(task.status);
    const history = taskHistory(
      { status: task.status, createdAt: fact.createdAt },
      changesById.get(task.id) ?? [],
      now,
    );
    const estimate = estimateHours(
      {
        projectId: fact.projectId,
        level: fact.level,
        kind: executorKind(fact.email),
      },
      facts.manual.get(task.id) ?? null,
      samples,
    );
    const started = history.actualStart !== null || history.workedHours > 0;
    const openBlockers = (blockersOf.get(task.id) ?? []).filter((id) =>
      isPending(status.get(id)!),
    ).length;
    const mark: PlanMark | null = pending
      ? planMark({
          status: task.status,
          assigned: fact.email !== null,
          statusSince:
            task.statusSince ??
            changesById.get(task.id)?.at(-1)?.at ??
            fact.createdAt,
          p90Seconds:
            stats.get(fact.projectId)?.columnas[task.status]?.p90_s ?? null,
          openBlockers,
          now,
        })
      : null;
    return {
      task,
      fact,
      history,
      estimate,
      mark,
      remaining: pending
        ? remainingHours(estimate.hours, history.workedHours, started)
        : 0,
    };
  });

  const nodes: ScheduleNode[] = planned.map((p) => ({
    id: p.task.id,
    own: !p.task.external,
    pending: isPending(p.task.status),
    remainingHours: p.remaining,
    actualStart: p.history.actualStart,
    actualEnd: p.history.actualEnd,
  }));
  // The initiative's goal arrives with GT-02 (`objetivo`); until then the
  // path runs to the task that ends last.
  const goalTaskId: string | null = null;
  const schedule = buildSchedule(nodes, [...edges.values()], now, goalTaskId);
  const critical = new Set(schedule.critical?.taskIds ?? []);

  const summary = { advancing: 0, blocked: 0, stalled: 0, waiting: 0 };
  for (const p of planned) {
    if (critical.has(p.task.id) && p.mark) summary[p.mark]++;
  }

  return {
    initiativeId: detail.id,
    projectId: detail.projectId,
    name: detail.name,
    computedAt: now,
    estimatesComputedAt: cached.computedAt,
    estimatedEnd: schedule.estimatedEnd,
    criticalPath: {
      taskIds: schedule.critical?.taskIds ?? [],
      hours: round(schedule.critical?.hours ?? 0),
      goalTaskId,
      partial: detail.pendingChain.partial,
      cycle: schedule.critical === null,
      summary,
    },
    tasks: planned.map((p) => ({
      id: p.task.id,
      number: p.task.number,
      title: p.task.title,
      status: p.task.status,
      external: p.task.external,
      projectId: p.fact.projectId,
      assignee: p.task.assignee,
      plain: p.task.external ? null : plainParagraph(p.fact.description),
      actualStart: p.history.actualStart,
      actualEnd: p.history.actualEnd,
      workedHours: round(p.history.workedHours),
      estimate: { ...p.estimate, hours: round(p.estimate.hours) },
      remainingHours: round(p.remaining),
      plannedStart: schedule.dates.get(p.task.id)!.plannedStart,
      plannedEnd: schedule.dates.get(p.task.id)!.plannedEnd,
      critical: critical.has(p.task.id),
      mark: p.mark,
      blockReason: p.task.blockReason,
      blockReasonDetail: p.task.blockReasonDetail,
      dependsOn: blockersOf.get(p.task.id) ?? [],
    })),
  };
}
