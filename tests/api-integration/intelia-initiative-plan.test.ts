import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import {
  type AutomationLevel,
  boardSignalTable,
  initiativeTable,
  taskAutomationTable,
  taskInitiativeTable,
} from "../../apps/api/src/intelia/schema";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

type App = ReturnType<typeof createApp>["app"];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);

let nextNumber = 1;

beforeEach(async () => {
  await resetTestDatabase();
  nextNumber = 1;
  vi.restoreAllMocks();
});

type TaskFields = Partial<typeof schema.taskTable.$inferInsert> & {
  initiativeId?: string;
  level?: AutomationLevel;
};

async function seedTask(projectId: string, fields: TaskFields = {}) {
  const { initiativeId, level, ...overrides } = fields;
  const number = nextNumber++;
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      title: `Tarea ${number}`,
      description: "",
      priority: "medium",
      status: "to-do",
      number,
      position: number,
      ...overrides,
    })
    .returning();
  if (!task) throw new Error("Failed to seed task");
  if (initiativeId) {
    await db.insert(taskInitiativeTable).values({
      taskId: task.id,
      initiativeId,
      origin: "plan",
      source: "session",
    });
  }
  if (level) {
    await db.insert(taskAutomationTable).values({
      taskId: task.id,
      level,
      verification: level === "completa",
      source: "session",
    });
  }
  return task;
}

function seedChange(
  taskId: string,
  oldStatus: string,
  newStatus: string,
  createdAt: Date,
  type = "status_changed",
) {
  return db.insert(schema.activityTable).values({
    taskId,
    type,
    eventData:
      type === "moved"
        ? { fromProjectId: "old", toProjectId: "new", oldStatus, newStatus }
        : { oldStatus, newStatus },
    createdAt,
  });
}

type Worker = { estado: "activo" | "caido" | "terminado"; trabajando: boolean };

// What the dispatcher writes every 2 minutes (RT-05).
function seedWorkers(
  projectId: string,
  workers: Record<string, Worker>,
  calculatedAt = ago(60_000),
) {
  const tareas = Object.fromEntries(
    Object.entries(workers).map(([taskId, worker]) => [
      taskId,
      {
        alarma: null,
        espera_a: null,
        worker: {
          ...worker,
          instancia: "coder-1234",
          rol: "coder",
          ultima_senal: calculatedAt.toISOString(),
        },
      },
    ]),
  );
  return db
    .insert(boardSignalTable)
    .values({ projectId, signals: { columnas: {}, tareas }, calculatedAt });
}

// A task finished 10 days ago after `hours` in In progress, plus one hour
// Blocked in between that must not count. With `moved`, its last change is a
// move from another project straight into Done.
async function seedFinished(
  projectId: string,
  hours: number,
  fields: { level: AutomationLevel; userId: string },
  last = "status_changed",
) {
  const createdAt = ago(20 * DAY);
  const task = await seedTask(projectId, {
    ...fields,
    status: "done",
    createdAt,
  });
  const start = createdAt.getTime() + HOUR;
  const half = (hours / 2) * HOUR;
  await seedChange(task.id, "to-do", "in-progress", new Date(start));
  await seedChange(task.id, "in-progress", "blocked", new Date(start + half));
  await seedChange(
    task.id,
    "blocked",
    "in-progress",
    new Date(start + half + HOUR),
  );
  await seedChange(
    task.id,
    "in-progress",
    "done",
    new Date(start + 2 * half + HOUR),
    last,
  );
  return task;
}

async function seedMany(
  count: number,
  projectId: string,
  hours: (i: number) => number,
  fields: { level: AutomationLevel; userId: string },
  last = "status_changed",
) {
  for (let i = 0; i < count; i++) {
    await seedFinished(projectId, hours(i), fields, last);
  }
}

async function seedInitiative(projectId: string) {
  const [initiative] = await db
    .insert(initiativeTable)
    .values({
      projectId,
      name: "Informe",
      nameKey: "informe",
      source: "session",
    })
    .returning();
  if (!initiative) throw new Error("Failed to seed initiative");
  return initiative;
}

// Manual estimates through GT-02's API, as an orchestrator sets them.
async function manualEstimate(app: App, values: Record<string, number>) {
  for (const [taskId, hours] of Object.entries(values)) {
    const response = await app.request(`/api/task/estimacion_horas/${taskId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ estimacion_horas: hours }),
    });
    expect(response.status).toBe(200);
  }
}

// The initiative's goal through GT-02's API.
async function setGoal(app: App, initiativeId: string, taskId: string) {
  const response = await app.request(
    `/api/intelia/initiative/${initiativeId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objetivo: taskId }),
    },
  );
  expect(response.status).toBe(200);
}

function blocks(sourceTaskId: string, targetTaskId: string) {
  return db
    .insert(schema.taskRelationTable)
    .values({ sourceTaskId, targetTaskId, relationType: "blocks" });
}

async function setup() {
  const { user, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Jaime",
  });
  const { project } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Software Factory",
    slug: "SF",
  });
  const other = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Intelia",
    slug: "INT",
  });
  // The account ephemeral coders work with (design 00 §5 of the factory).
  const [coder] = await db
    .insert(schema.userTable)
    .values({
      id: `coder-${nextNumber}`,
      email: `role-coder-${workspace.id}@inteliatech.internal`.toLowerCase(),
      emailVerified: true,
      name: "coder",
    })
    .returning();
  await db.insert(schema.workspaceUserTable).values({
    workspaceId: workspace.id,
    userId: coder!.id,
    role: "member",
    joinedAt: new Date(),
  });
  mockAuthenticatedSession(user);
  const initiative = await seedInitiative(project.id);
  return {
    app: createApp().app,
    user,
    coder: coder!,
    workspace,
    project,
    other: other.project,
    initiative,
  };
}

type PlanTask = {
  id: string;
  estimate: { hours: number; source: string; cases: number };
  [key: string]: unknown;
};

async function plan(app: App, initiativeId: string, query = "") {
  const response = await app.request(
    `/api/intelia/initiative/${initiativeId}/plan${query}`,
  );
  const body = await response.json();
  const task = (id: string) =>
    (body.tasks as PlanTask[]).find((t) => t.id === id)!;
  return { status: response.status, body, task };
}

describe("GET /api/intelia/initiative/{initiativeId}/plan", () => {
  it("marks stalled only for a ready role in To do or an idle In progress task", async () => {
    const { app, coder, user, project, initiative } = await setup();
    const own = (fields: TaskFields) =>
      seedTask(project.id, { initiativeId: initiative.id, ...fields });
    const backlog = await own({ status: "backlog", userId: coder.id });
    const design = await own({ status: "design", userId: coder.id });
    const ready = await own({ status: "to-do", userId: coder.id });
    const waiting = await own({ status: "to-do", userId: coder.id });
    const unassigned = await own({ status: "to-do" });
    const person = await own({ status: "to-do", userId: user.id });
    const idle = await own({ status: "in-progress", userId: coder.id });
    const working = await own({ status: "in-progress", userId: coder.id });
    await blocks(backlog.id, waiting.id);
    await seedWorkers(project.id, {
      [working.id]: { estado: "activo", trabajando: true },
    });
    const { task } = await plan(app, initiative.id);
    for (const t of [backlog, design, unassigned, person])
      expect(task(t.id).mark).toBeNull();
    expect(task(ready.id).mark).toBe("stalled");
    expect(task(waiting.id).mark).toBe("waiting");
    expect(task(idle.id).mark).toBe("stalled");
    expect(task(working.id).mark).toBe("advancing");
  });

  it("intersects the requested scope for tasks, dependencies and estimation samples", async () => {
    const { app, coder, project, other, initiative } = await setup();
    const alike = { level: "completa" as const, userId: coder.id };
    await seedMany(10, other.id, () => 50, alike);
    const secret = await seedTask(other.id, { title: "Excluded dependency" });
    const own = await seedTask(project.id, {
      ...alike,
      initiativeId: initiative.id,
    });
    await blocks(secret.id, own.id);

    const unrestricted = await plan(app, initiative.id);
    expect(unrestricted.body.projectScope).toBeNull();
    expect(unrestricted.task(own.id).estimate.source).toBe("org");
    const scoped = await plan(app, initiative.id, `?projectIds=${project.id}`);
    expect(scoped.body.projectScope).toEqual([project.id]);
    expect(scoped.task(own.id).estimate).toEqual({
      hours: 4,
      source: "default",
      cases: 0,
    });
    expect(scoped.task(own.id).dependsOn).toEqual([]);
    expect(scoped.body.criticalPath.partial).toBe(true);
    expect(JSON.stringify(scoped.body)).not.toContain(secret.id);
    expect(JSON.stringify(scoped.body)).not.toContain("Excluded dependency");

    const empty = await plan(app, initiative.id, "?projectIds=");
    expect(empty.body.projectScope).toEqual([]);
    expect(empty.body.tasks).toEqual([]);
  });

  it("estimates with the median of finished tasks of the same project, level and executor", async () => {
    const { app, user, coder, project, other, initiative } = await setup();
    const alike = { level: "completa" as const, userId: coder.id };
    await seedMany(10, project.id, (i) => i + 1, alike);
    // Not alike: another level, a person, another project.
    await seedMany(10, project.id, () => 50, { ...alike, level: "arranque" });
    await seedMany(10, project.id, () => 50, { ...alike, userId: user.id });
    await seedMany(10, other.id, () => 50, alike);
    // Done without a stay in In progress: says nothing about the work.
    await seedTask(project.id, { ...alike, status: "done" });
    const pending = await seedTask(project.id, {
      ...alike,
      initiativeId: initiative.id,
    });

    const { status, task } = await plan(app, initiative.id);
    expect(status).toBe(200);
    expect(task(pending.id)).toMatchObject({
      estimate: { hours: 5.5, source: "project", cases: 10 },
      remainingHours: 5.5,
    });
  });

  it("widens to the workspace with 9 cases, falls back to 4 h with none, and lets estimacion_horas win", async () => {
    const { app, user, coder, project, other, initiative } = await setup();
    const alike = { level: "completa" as const, userId: coder.id };
    await seedMany(9, project.id, () => 2, alike);
    await seedMany(10, other.id, () => 8, alike);
    const widened = await seedTask(project.id, {
      ...alike,
      initiativeId: initiative.id,
    });
    const unseen = await seedTask(project.id, {
      level: "manual",
      userId: user.id,
      initiativeId: initiative.id,
    });
    const manual = await seedTask(project.id, {
      ...alike,
      initiativeId: initiative.id,
    });
    await manualEstimate(app, { [manual.id]: 6.5 });

    const { task } = await plan(app, initiative.id);
    expect(task(widened.id).estimate).toEqual({
      hours: 8,
      source: "org",
      cases: 19,
    });
    expect(task(unseen.id).estimate).toEqual({
      hours: 4,
      source: "default",
      cases: 0,
    });
    expect(task(manual.id).estimate).toEqual({
      hours: 6.5,
      source: "manual",
      cases: 0,
    });
  });

  it("plans pending tasks after their blockers and takes the chain of most hours as critical", async () => {
    const { app, coder, project, initiative } = await setup();
    const own = (fields: TaskFields = {}) =>
      seedTask(project.id, { initiativeId: initiative.id, ...fields });
    // a (2 h) and b (5 h) block c (1 h); d (3 h) stands alone. Both chains to
    // c have two tasks: the critical one is b → c, with more hours.
    const a = await own({
      description: "**En llano.** Primero.\n\nResto",
      userId: coder.id,
    });
    const b = await own({ userId: coder.id });
    const c = await own();
    const d = await own();
    await blocks(a.id, c.id);
    await blocks(b.id, c.id);
    const doing = await own({
      status: "in-progress",
      userId: coder.id,
      createdAt: ago(DAY),
    });
    await seedChange(doing.id, "to-do", "in-progress", ago(3 * HOUR));
    const startedAt = ago(5 * HOUR);
    const finishedAt = ago(2 * HOUR);
    const done = await own({ status: "done", createdAt: ago(DAY) });
    await seedChange(done.id, "to-do", "in-progress", startedAt);
    await seedChange(done.id, "in-progress", "done", finishedAt);
    await manualEstimate(app, {
      [a.id]: 2,
      [b.id]: 5,
      [c.id]: 1,
      [d.id]: 3,
      [doing.id]: 4,
    });
    await seedWorkers(project.id, {
      [doing.id]: { estado: "activo", trabajando: true },
    });

    const { body, task } = await plan(app, initiative.id);
    const computedAt = new Date(body.computedAt).getTime();
    const hoursFromNow = (value: string) =>
      (new Date(value).getTime() - computedAt) / HOUR;

    expect(body.criticalPath).toMatchObject({
      taskIds: [b.id, c.id],
      hours: 6,
      goalTaskId: null,
      partial: false,
      cycle: false,
      summary: { advancing: 0, blocked: 0, stalled: 1, waiting: 1 },
    });
    expect(hoursFromNow(body.estimatedEnd)).toBe(6);
    expect(hoursFromNow(task(c.id).plannedStart as string)).toBe(5);
    expect(task(c.id)).toMatchObject({ critical: true, mark: "waiting" });
    expect(task(a.id)).toMatchObject({
      critical: false,
      mark: "stalled",
      stallReason: "not_started",
      plain: "Primero.",
      dependsOn: [],
    });
    expect(task(c.id).dependsOn).toEqual([a.id, b.id]);
    // 4 h estimated, about 3 h worked: about 1 h left, at least 1.
    expect(task(doing.id)).toMatchObject({
      mark: "advancing",
      stallReason: null,
      workedHours: 3,
      remainingHours: 1,
      estimate: { hours: 4, source: "manual" },
    });
    expect(task(done.id)).toMatchObject({
      actualStart: startedAt.toISOString(),
      plannedStart: startedAt.toISOString(),
      actualEnd: finishedAt.toISOString(),
      plannedEnd: finishedAt.toISOString(),
      remainingHours: 0,
      mark: null,
      critical: false,
    });
  });

  it("ends the critical path at the initiative's goal, even with a longer independent branch", async () => {
    const { app, project, initiative } = await setup();
    const own = () => seedTask(project.id, { initiativeId: initiative.id });
    // first (2 h) → goal (4 h): 6 h to the goal; alone (20 h) ends later.
    const first = await own();
    const goal = await own();
    const alone = await own();
    await blocks(first.id, goal.id);
    await manualEstimate(app, { [first.id]: 2, [goal.id]: 4, [alone.id]: 20 });

    const before = await plan(app, initiative.id);
    expect(before.body.criticalPath).toMatchObject({
      taskIds: [alone.id],
      hours: 20,
      goalTaskId: null,
    });

    await setGoal(app, initiative.id, goal.id);
    const { body, task } = await plan(app, initiative.id);
    const hoursFromNow = (value: string) =>
      (new Date(value).getTime() - new Date(body.computedAt).getTime()) / HOUR;
    expect(body.criticalPath).toMatchObject({
      taskIds: [first.id, goal.id],
      hours: 6,
      goalTaskId: goal.id,
    });
    expect(hoursFromNow(body.estimatedEnd)).toBe(6);
    expect(task(alone.id)).toMatchObject({ critical: false });
    expect(task(goal.id).estimate).toEqual({
      hours: 4,
      source: "manual",
      cases: 0,
    });
  });

  it("advances an agent's task only with a fresh worker that is working, and says why the others are stalled", async () => {
    const { app, coder, project, other, initiative } = await setup();
    const inProgress = async () => {
      const task = await seedTask(project.id, {
        initiativeId: initiative.id,
        status: "in-progress",
        userId: coder.id,
        createdAt: ago(2 * HOUR),
      });
      await seedChange(task.id, "to-do", "in-progress", ago(HOUR));
      return task;
    };
    const live = await inProgress();
    const idle = await inProgress();
    const down = await inProgress();
    const none = await inProgress();
    await seedWorkers(project.id, {
      [live.id]: { estado: "activo", trabajando: true },
      [idle.id]: { estado: "activo", trabajando: false },
      [down.id]: { estado: "caido", trabajando: false },
    });
    // Another project's signals say nothing of this project's tasks.
    await seedWorkers(other.id, {
      [none.id]: { estado: "activo", trabajando: true },
    });

    const { task } = await plan(app, initiative.id);
    expect(task(live.id)).toMatchObject({ mark: "advancing" });
    expect(task(idle.id)).toMatchObject({ stallReason: "worker_idle" });
    expect(task(down.id)).toMatchObject({ stallReason: "worker_down" });
    expect(task(none.id)).toMatchObject({ stallReason: "no_worker" });

    // What the dispatcher said 20 minutes ago no longer says anyone works.
    await db.update(boardSignalTable).set({ calculatedAt: ago(20 * 60_000) });
    const stale = await plan(app, initiative.id);
    expect(stale.task(live.id)).toMatchObject({
      mark: "stalled",
      stallReason: "no_worker",
    });
  });

  it("follows moves between projects that change the column, in the dates and in the estimates", async () => {
    const { app, user, coder, project, initiative } = await setup();
    const alike = { level: "completa" as const, userId: coder.id };
    // Ten tasks that reached Done by a move: their stays count as cases.
    await seedMany(10, project.id, () => 3, alike, "moved");
    const pending = await seedTask(project.id, {
      ...alike,
      initiativeId: initiative.id,
    });
    const startedAt = ago(6 * HOUR);
    const movedAt = ago(2 * HOUR);
    const moved = await seedTask(project.id, {
      initiativeId: initiative.id,
      status: "done",
      createdAt: ago(DAY),
    });
    await seedChange(moved.id, "to-do", "in-progress", startedAt);
    await seedChange(moved.id, "in-progress", "done", movedAt, "moved");
    // Moves that keep the column change nothing.
    await seedChange(moved.id, "done", "done", ago(HOUR), "moved");
    for (let i = 0; i < 10; i++) {
      const created = ago(110 * DAY);
      const old = await seedTask(project.id, {
        ...alike,
        status: "done",
        createdAt: created,
      });
      const start = created.getTime() + HOUR;
      await seedChange(old.id, "to-do", "in-progress", new Date(start));
      await seedChange(
        old.id,
        "in-progress",
        "done",
        new Date(start + 5 * HOUR),
      );
      await seedChange(old.id, "done", "done", ago(DAY), "moved");
    }
    // A person's task 5 h in In progress, past the column's p90 (1.5 h):
    // its age alone does not imply that nobody is working.
    const stuck = await seedTask(project.id, {
      initiativeId: initiative.id,
      status: "in-progress",
      userId: user.id,
      createdAt: ago(DAY),
    });
    await seedChange(stuck.id, "to-do", "in-progress", ago(5 * HOUR));
    await seedChange(
      stuck.id,
      "in-progress",
      "in-progress",
      ago(30 * 60_000),
      "moved",
    );

    const { task } = await plan(app, initiative.id);
    expect(task(pending.id).estimate).toEqual({
      hours: 3,
      source: "project",
      cases: 10,
    });
    expect(task(moved.id)).toMatchObject({
      actualStart: startedAt.toISOString(),
      actualEnd: movedAt.toISOString(),
      workedHours: 4,
    });
    expect(task(stuck.id)).toMatchObject({
      mark: null,
      stallReason: null,
      workedHours: 5,
    });
  });

  it("gives the reason of a readable Blocked dependency in another project", async () => {
    const { app, other, project, initiative } = await setup();
    const external = await seedTask(other.id, { status: "blocked" });
    const blockedAt = ago(HOUR);
    await seedChange(external.id, "in-progress", "blocked", blockedAt);
    const own = await seedTask(project.id, { initiativeId: initiative.id });
    await blocks(external.id, own.id);
    const [field] = await db
      .insert(schema.customFieldDefinitionTable)
      .values({ projectId: other.id, name: "motivo_bloqueo", type: "dropdown" })
      .returning();
    await db.insert(schema.customFieldValueTable).values({
      taskId: external.id,
      fieldId: field!.id,
      value: "dependencias",
    });

    const { body, task } = await plan(app, initiative.id);
    expect(task(external.id)).toMatchObject({
      external: true,
      mark: "blocked",
      statusSince: blockedAt.toISOString(),
      blockReason: "dependencias",
      critical: true,
    });
    expect(task(own.id)).toMatchObject({ mark: "waiting" });
    expect(body.criticalPath.summary).toMatchObject({ blocked: 1, waiting: 1 });
  });

  it("answers 404 for an unknown initiative", async () => {
    const { app } = await setup();
    const { status } = await plan(app, "missing");
    expect(status).toBe(404);
  });
});

describe("a project the caller cannot read", () => {
  it("leaves its tasks out of the plan and of the estimates", async () => {
    const { app, user, coder, workspace, project, initiative } = await setup();
    const hidden = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Personal",
      slug: "HID",
    });
    const alike = { level: "completa" as const, userId: coder.id };
    await seedMany(10, hidden.project.id, () => 50, alike);
    const secret = await seedTask(hidden.project.id, {
      ...alike,
      title: "Tarea secreta",
    });
    const own = await seedTask(project.id, {
      ...alike,
      initiativeId: initiative.id,
    });
    await blocks(secret.id, own.id);

    // Someone who reads both sees the hidden cases and the dependency.
    const full = await plan(app, initiative.id);
    expect(full.task(own.id).estimate).toEqual({
      hours: 50,
      source: "org",
      cases: 10,
    });
    expect(full.task(secret.id)).toMatchObject({ external: true });

    const reader = await addWorkspaceMember(workspace.id, "member");
    await restrictToProjects(workspace.id, reader.id, [project.id]);
    mockAuthenticatedSession(reader);
    const attempted = await plan(
      app,
      initiative.id,
      `?projectIds=${project.id},${hidden.project.id}`,
    );
    expect(attempted.body.projectScope).toEqual([project.id]);
    expect(JSON.stringify(attempted.body)).not.toContain(secret.id);
    expect(attempted.task(own.id).estimate.source).toBe("default");
    const hiddenInitiative = await seedInitiative(hidden.project.id);
    const denied = await plan(
      app,
      hiddenInitiative.id,
      `?projectIds=${hidden.project.id}`,
    );
    expect([403, 404]).toContain(denied.status);
    const limited = await plan(app, initiative.id);
    expect(limited.status).toBe(200);
    expect(limited.body.tasks.map((t: PlanTask) => t.id)).toEqual([own.id]);
    expect(limited.task(own.id)).toMatchObject({
      estimate: { hours: 4, source: "default", cases: 0 },
      dependsOn: [],
      mark: "stalled",
      stallReason: "not_started",
    });
    expect(limited.body.criticalPath).toMatchObject({
      taskIds: [own.id],
      partial: true,
    });
    const raw = JSON.stringify(limited.body);
    for (const leaked of [secret.id, "Tarea secreta", "HID", user.id]) {
      expect(raw).not.toContain(leaked);
    }
  });
});
