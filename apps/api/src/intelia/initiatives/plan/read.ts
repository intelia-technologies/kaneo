import { and, asc, eq, inArray } from "drizzle-orm";
import db from "../../../database";
import {
  activityTable,
  projectTable,
  taskTable,
  userTable,
} from "../../../database/schema";
import { boardSignalTable, taskAutomationTable } from "../../schema";
import { columnStats } from "../../status-age/read";
import { type InitiativeReader, readableProject } from "../access";
import { blockReasons, getInitiativeDetail } from "../read";
import { estimateHours, remainingHours } from "./estimate";
import { executorKind } from "./executor";
import { COLUMN_CHANGE_TYPES, type StatusChange, taskHistory } from "./history";
import { planMark, type WorkerSignal } from "./mark";
import { plainParagraph } from "./plain";
import { workspaceSamples } from "./samples";
import { buildSchedule, type ScheduleNode } from "./schedule";

const isPending = (status: string) =>
  status !== "done" && status !== "cancelled" && status !== "canceled";

const round = (hours: number) => Math.round(hours * 10) / 10;

// What the dispatcher said of a worker is current for 10 minutes, as on the
// card (RT-05): it rewrites the board signals every 2.
const WORKER_STALE_MS = 10 * 60 * 1000;

// Workers of readable tasks in fresh board signals, each taken only from the
// signals of its own project (`projectOf`), as the card reads them.
async function freshWorkers(projectOf: Map<string, string>, now: Date) {
  const workers = new Map<string, WorkerSignal>();
  const projectIds = [...new Set(projectOf.values())];
  if (projectIds.length === 0) return workers;
  const rows = await db
    .select({
      projectId: boardSignalTable.projectId,
      signals: boardSignalTable.signals,
      calculatedAt: boardSignalTable.calculatedAt,
    })
    .from(boardSignalTable)
    .where(inArray(boardSignalTable.projectId, projectIds));
  for (const row of rows) {
    if (now.getTime() - row.calculatedAt.getTime() > WORKER_STALE_MS) continue;
    for (const [taskId, signal] of Object.entries(row.signals.tareas)) {
      const worker = (signal as { worker?: WorkerSignal | null }).worker;
      if (worker && projectOf.get(taskId) === row.projectId) {
        workers.set(taskId, worker);
      }
    }
  }
  return workers;
}

// What the plan needs of each task beyond the initiative detail, for tasks
// the detail already filtered as readable.
async function taskFacts(ids: string[]) {
  if (ids.length === 0) return { rows: [], changes: [] };
  const [rows, changes] = await Promise.all([
    db
      .select({
        id: taskTable.id,
        projectId: taskTable.projectId,
        createdAt: taskTable.createdAt,
        description: taskTable.description,
        email: userTable.email,
        level: taskAutomationTable.level,
        // The manual estimate (GT-02): a column of the task, null when unset.
        manualHours: taskTable.estimacion_horas,
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
        taskId: activityTable.taskId,
        at: activityTable.createdAt,
        eventData: activityTable.eventData,
      })
      .from(activityTable)
      .where(
        and(
          inArray(activityTable.taskId, ids),
          inArray(activityTable.type, COLUMN_CHANGE_TYPES),
        ),
      )
      .orderBy(asc(activityTable.createdAt), asc(activityTable.id)),
  ]);
  return { rows, changes };
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
    // A move that keeps the column is not a column change.
    if (typeof data.newStatus !== "string") continue;
    if (data.newStatus === data.oldStatus) continue;
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
  const [statsEntries, workers, reasons] = await Promise.all([
    Promise.all(
      pendingProjects.map(
        async (projectId) => [projectId, await columnStats(projectId)] as const,
      ),
    ),
    freshWorkers(
      new Map(
        tasks
          .filter((task) => isPending(task.status))
          .map((task) => [task.id, factsById.get(task.id)!.projectId]),
      ),
      now,
    ),
    // The detail has no reason for the external Blocked tasks: read them all.
    blockReasons(tasks),
  ]);
  const stats = new Map(statsEntries);

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
      fact.manualHours,
      samples,
    );
    const started = history.actualStart !== null || history.workedHours > 0;
    const openBlockers = (blockersOf.get(task.id) ?? []).filter((id) =>
      isPending(status.get(id)!),
    ).length;
    const { mark, stallReason } = pending
      ? planMark({
          status: task.status,
          executor: executorKind(fact.email),
          worker: workers.get(task.id) ?? null,
          statusSince: history.statusSince,
          p90Seconds:
            stats.get(fact.projectId)?.columnas[task.status]?.p90_s ?? null,
          openBlockers,
          now,
        })
      : { mark: null, stallReason: null };
    const reason = reasons.get(task.id);
    return {
      task,
      fact,
      history,
      estimate,
      mark,
      stallReason,
      blockReason: reason?.blockReason ?? null,
      blockReasonDetail: reason?.blockReasonDetail ?? null,
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
  // The initiative's goal (`objetivo`, GT-02), only as one of its readable
  // tasks: the path ends there while it is pending, else at the task that
  // ends last.
  const goalTaskId =
    detail.objetivo && detail.tasks.some((t) => t.id === detail.objetivo)
      ? detail.objetivo
      : null;
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
      stallReason: p.stallReason,
      blockReason: p.blockReason,
      blockReasonDetail: p.blockReasonDetail,
      dependsOn: blockersOf.get(p.task.id) ?? [],
    })),
  };
}
