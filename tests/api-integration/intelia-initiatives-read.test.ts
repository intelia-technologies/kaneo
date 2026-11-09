import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import {
  initiativeTable,
  type TaskOrigin,
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

let nextNumber = 1;

beforeEach(async () => {
  await resetTestDatabase();
  nextNumber = 1;
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function seedInitiative(projectId: string, name: string) {
  const [initiative] = await db
    .insert(initiativeTable)
    .values({
      projectId,
      name,
      nameKey: name.toLowerCase(),
      source: "session",
      createdByActor: "agent:orq-jaime",
    })
    .returning();
  if (!initiative) throw new Error("Failed to seed initiative");
  return initiative;
}

async function seedTask(
  projectId: string,
  fields: Partial<typeof schema.taskTable.$inferInsert> & {
    initiativeId?: string;
    origin?: TaskOrigin;
  } = {},
) {
  const { initiativeId, origin = "plan", ...overrides } = fields;
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
    await db
      .insert(taskInitiativeTable)
      .values({ taskId: task.id, initiativeId, origin, source: "session" });
  }
  return task;
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
  mockAuthenticatedSession(user);
  return { app: createApp().app, user, workspace, project };
}

async function getJson(app: App, path: string, headers = {}) {
  const response = await app.request(`/api/intelia${path}`, { headers });
  return { status: response.status, body: await response.json() };
}

describe("GET /api/intelia/project/{projectId}/initiatives", () => {
  it("counts cancelled, added and unrecorded tasks and lists blocked ones with their reason", async () => {
    const { app, user, project } = await setup();
    const motor = await seedInitiative(project.id, "Motor de flujo");
    const id = motor.id;
    await seedTask(project.id, { initiativeId: id, status: "done" });
    await seedTask(project.id, { initiativeId: id, status: "in-progress" });
    await seedTask(project.id, { initiativeId: id, status: "cancelled" });
    const blocked = await seedTask(project.id, {
      initiativeId: id,
      status: "blocked",
      title: "Verificar contrato",
      userId: user.id,
    });
    await seedTask(project.id, {
      initiativeId: id,
      origin: "añadido",
      status: "done",
    });
    await seedTask(project.id, { initiativeId: id, origin: "añadido" });
    await seedTask(project.id, {
      initiativeId: id,
      origin: "añadido",
      status: "cancelled",
    });
    await seedTask(project.id, {
      initiativeId: id,
      origin: "sin_registro",
      status: "done",
    });
    await seedTask(project.id, { initiativeId: id, origin: "sin_registro" });

    const [reason, detail] = await db
      .insert(schema.customFieldDefinitionTable)
      .values([
        { projectId: project.id, name: "motivo_bloqueo", type: "dropdown" },
        {
          projectId: project.id,
          name: "motivo_bloqueo_detalle",
          type: "text",
        },
      ])
      .returning();
    await db.insert(schema.customFieldValueTable).values([
      { taskId: blocked.id, fieldId: reason!.id, value: "dependencias" },
      { taskId: blocked.id, fieldId: detail!.id, value: "Falta el gateway" },
    ]);

    const empty = await seedInitiative(project.id, "Sin tareas");
    const cancelled = await seedInitiative(project.id, "Canceladas");
    await seedTask(project.id, {
      initiativeId: cancelled.id,
      status: "cancelled",
    });
    const finished = await seedInitiative(project.id, "Terminada");
    await seedTask(project.id, { initiativeId: finished.id, status: "done" });
    await seedTask(project.id, {
      initiativeId: finished.id,
      status: "cancelled",
    });
    const orphan = await seedTask(project.id, { title: "Sin iniciativa" });

    const { status, body } = await getJson(
      app,
      `/project/${project.id}/initiatives`,
    );
    expect(status).toBe(200);
    const byName = Object.fromEntries(
      body.initiatives.map((i: { name: string }) => [i.name, i]),
    );
    expect(byName["Motor de flujo"]).toMatchObject({
      id,
      projectId: project.id,
      createdByActor: "agent:orq-jaime",
      planClosedAt: null,
      state: "in_flight",
      counters: {
        total: 9,
        active: 7,
        done: 3,
        cancelled: 2,
        blocked: 1,
        plan: { total: 4, active: 3, done: 1 },
        added: { total: 3, active: 2, done: 1 },
        unrecorded: { total: 2, active: 2, done: 1 },
      },
      blockedTasks: [
        {
          id: blocked.id,
          title: "Verificar contrato",
          assignee: { id: user.id, name: "Jaime" },
          blockReason: "dependencias",
          blockReasonDetail: "Falta el gateway",
        },
      ],
    });
    expect(byName["Sin tareas"]).toMatchObject({
      id: empty.id,
      state: "no_tasks",
      counters: { total: 0, active: 0 },
    });
    expect(byName.Canceladas).toMatchObject({
      state: "all_cancelled",
      counters: { total: 1, active: 0, cancelled: 1 },
    });
    expect(byName.Terminada).toMatchObject({
      state: "finished",
      counters: { total: 2, active: 1, done: 1, cancelled: 1 },
    });
    expect(body.withoutInitiative).toEqual([
      {
        id: orphan.id,
        number: orphan.number,
        title: "Sin iniciativa",
        status: "to-do",
        assignee: null,
      },
    ]);
  });

  it("returns 30 initiatives with their counters in one call", async () => {
    const { app, project } = await setup();
    for (let i = 1; i <= 30; i++) {
      const initiative = await seedInitiative(project.id, `Iniciativa ${i}`);
      await seedTask(project.id, {
        initiativeId: initiative.id,
        status: "done",
      });
      for (let j = 0; j < i % 3; j++) {
        await seedTask(project.id, {
          initiativeId: initiative.id,
          origin: "añadido",
        });
      }
    }

    const { status, body } = await getJson(
      app,
      `/project/${project.id}/initiatives`,
    );
    expect(status).toBe(200);
    expect(body.initiatives).toHaveLength(30);
    for (const [index, row] of body.initiatives.entries()) {
      const added = (index + 1) % 3;
      expect(row.name).toBe(`Iniciativa ${index + 1}`);
      expect(row.counters).toMatchObject({
        total: 1 + added,
        done: 1,
        plan: { total: 1, done: 1 },
        added: { total: added, done: 0 },
      });
      expect(row.state).toBe(added ? "in_flight" : "finished");
    }
  });

  it("reads with the API key of a member account and refuses a project the caller cannot read", async () => {
    const { app, workspace, project } = await setup();
    await seedInitiative(project.id, "Motor de flujo");
    const member = await addWorkspaceMember(workspace.id, "member");
    const { key } = await auth.api.createApiKey({
      body: { userId: member.id, name: "orquestador" },
    });

    const listed = await getJson(app, `/project/${project.id}/initiatives`, {
      "x-api-key": key,
    });
    expect(listed.status).toBe(200);
    expect(listed.body.initiatives).toHaveLength(1);
    const detail = await getJson(
      app,
      `/initiative/${listed.body.initiatives[0].id}`,
      { "x-api-key": key },
    );
    expect(detail.status).toBe(200);
    expect(detail.body.projectId).toBe(project.id);

    const other = await createProjectFixture({ workspaceId: workspace.id });
    await restrictToProjects(workspace.id, member.id, [other.project.id]);
    mockAuthenticatedSession(member);
    expect(
      (await getJson(app, `/project/${project.id}/initiatives`)).status,
    ).toBe(403);
    expect((await getJson(app, "/initiative/unknown")).status).toBe(404);
  });
});

describe("GET /api/intelia/initiative/{initiativeId}", () => {
  it("returns its tasks with origin, assignee, dependencies, status age and the pending chain", async () => {
    const { app, user, workspace, project } = await setup();
    const initiative = await seedInitiative(project.id, "Motor de flujo");
    const other = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Gateway",
      slug: "GW",
    });
    const external = await seedTask(other.project.id, {
      title: "Contrato del gateway",
      status: "in-progress",
    });
    const first = await seedTask(project.id, {
      initiativeId: initiative.id,
      createdAt: new Date("2026-10-01T10:00:00Z"),
    });
    const second = await seedTask(project.id, {
      initiativeId: initiative.id,
      origin: "añadido",
      status: "blocked",
      userId: user.id,
    });
    const done = await seedTask(project.id, {
      initiativeId: initiative.id,
      status: "done",
    });
    await blocks(external.id, first.id);
    await blocks(first.id, second.id);
    await blocks(done.id, second.id);
    await db.insert(schema.activityTable).values([
      {
        taskId: second.id,
        type: "status_changed",
        createdAt: new Date("2026-10-20T08:00:00Z"),
      },
      {
        taskId: second.id,
        type: "status_changed",
        createdAt: new Date("2026-10-25T08:00:00Z"),
      },
      {
        taskId: second.id,
        type: "title_changed",
        createdAt: new Date("2026-10-30T08:00:00Z"),
      },
    ]);

    const { status, body } = await getJson(app, `/initiative/${initiative.id}`);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      id: initiative.id,
      projectId: project.id,
      name: "Motor de flujo",
      createdByActor: "agent:orq-jaime",
      state: "in_flight",
      counters: { total: 3, active: 3, done: 1, blocked: 1 },
    });
    const byId = Object.fromEntries(
      body.tasks.map((t: { id: string }) => [t.id, t]),
    );
    expect(byId[first.id]).toMatchObject({
      origin: "plan",
      status: "to-do",
      assignee: null,
      statusSince: "2026-10-01T10:00:00.000Z",
      dependsOn: [external.id],
      blocks: [second.id],
    });
    expect(byId[second.id]).toMatchObject({
      origin: "añadido",
      status: "blocked",
      assignee: { id: user.id, name: "Jaime" },
      statusSince: "2026-10-25T08:00:00.000Z",
      blockReason: null,
      blockReasonDetail: null,
    });
    expect(byId[second.id].dependsOn.sort()).toEqual(
      [first.id, done.id].sort(),
    );
    expect(body.externalTasks).toEqual([
      {
        id: external.id,
        number: external.number,
        title: "Contrato del gateway",
        status: "in-progress",
        projectId: other.project.id,
        projectSlug: "GW",
        projectName: "Gateway",
        initiativeId: null,
      },
    ]);
    expect(body.pendingChain).toEqual({
      taskIds: [external.id, first.id, second.id],
      partial: false,
      cycle: false,
    });
  });

  it("reports a cycle instead of a chain", async () => {
    const { app, project } = await setup();
    const initiative = await seedInitiative(project.id, "Ciclo");
    const a = await seedTask(project.id, { initiativeId: initiative.id });
    const b = await seedTask(project.id, { initiativeId: initiative.id });
    await blocks(a.id, b.id);
    await blocks(b.id, a.id);

    const { body } = await getJson(app, `/initiative/${initiative.id}`);
    expect(body.pendingChain).toEqual({
      taskIds: [],
      partial: false,
      cycle: true,
    });
  });
});

describe("a project the caller cannot read", () => {
  async function hiddenSetup() {
    const context = await setup();
    const { workspace, project } = context;
    const hidden = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Proyecto oculto",
      slug: "HID",
    });
    const initiative = await seedInitiative(project.id, "Motor de flujo");
    const own = await seedTask(project.id, {
      initiativeId: initiative.id,
      title: "Tarea visible",
    });
    const secret = {
      title: "Tarea secreta",
      status: "blocked",
      userId: context.user.id,
    };
    // A dependency in the hidden project, and a task of the initiative in it
    // (design 52 §3.1: it counts, anonymized).
    const dependency = await seedTask(hidden.project.id, secret);
    const stray = await seedTask(hidden.project.id, {
      ...secret,
      initiativeId: initiative.id,
    });
    await blocks(dependency.id, own.id);
    const reader = await addWorkspaceMember(workspace.id, "member");
    await restrictToProjects(workspace.id, reader.id, [project.id]);
    return { ...context, initiative, own, dependency, stray, reader };
  }

  it("counts its tasks only anonymized, leaves them out of detail and dependencies and marks the chain partial", async () => {
    const { app, project, initiative, own, dependency, stray, reader } =
      await hiddenSetup();
    mockAuthenticatedSession(reader);

    const list = await getJson(app, `/project/${project.id}/initiatives`);
    expect(list.status).toBe(200);
    expect(list.body.initiatives[0]).toMatchObject({
      counters: {
        total: 2,
        active: 2,
        blocked: 1,
        hidden: { total: 1, active: 1, done: 0 },
      },
      blockedTasks: [],
    });

    const detail = await getJson(app, `/initiative/${initiative.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.tasks.map((t: { id: string }) => t.id)).toEqual([
      own.id,
    ]);
    expect(detail.body.tasks[0].dependsOn).toEqual([]);
    expect(detail.body.externalTasks).toEqual([]);
    expect(detail.body.counters).toMatchObject({
      total: 2,
      blocked: 1,
      hidden: { total: 1, active: 1, done: 0 },
    });
    expect(detail.body.pendingChain).toEqual({
      taskIds: [own.id],
      partial: true,
      cycle: false,
    });

    for (const raw of [
      JSON.stringify(list.body),
      JSON.stringify(detail.body),
    ]) {
      for (const leaked of [
        dependency.id,
        stray.id,
        "Tarea secreta",
        "Jaime",
        "HID",
      ]) {
        expect(raw).not.toContain(leaked);
      }
    }
  });

  it("shows everything to a caller who can read both projects", async () => {
    const { app, project, initiative, dependency, stray } = await hiddenSetup();

    const list = await getJson(app, `/project/${project.id}/initiatives`);
    expect(list.body.initiatives[0].counters).toMatchObject({
      total: 2,
      blocked: 1,
    });
    const detail = await getJson(app, `/initiative/${initiative.id}`);
    expect(detail.body.tasks.map((t: { id: string }) => t.id)).toContain(
      stray.id,
    );
    expect(detail.body.externalTasks.map((t: { id: string }) => t.id)).toEqual([
      dependency.id,
    ]);
    expect(detail.body.pendingChain.partial).toBe(false);
  });
});
