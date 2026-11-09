import { desc, eq, sql } from "drizzle-orm";
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
import { dropTaskInitiativeOnProjectMove } from "../../apps/api/src/intelia/initiatives/service";
import {
  initiativeChangeTable,
  initiativeTable,
  taskInitiativeChangeTable,
  taskInitiativeTable,
} from "../../apps/api/src/intelia/schema";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

const FORMER_TOKEN = "former-gateway-service-token-32-chars-or-more";
const DECLARED = "agent:orq-jaime";

let nextNumber = 1000;

beforeEach(async () => {
  await resetTestDatabase();
  nextNumber = 1000;
  vi.restoreAllMocks();
  vi.stubEnv("INTELIA_TASK_INITIATIVE_OPTIONAL", "");
  vi.stubEnv("INTELIA_TASK_AUTOMATION_OPTIONAL", "true");
  vi.stubEnv("INTELIA_GATEWAY_TOKEN", FORMER_TOKEN);
});

async function seedRawTask(
  projectId: string,
  overrides: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  const number = nextNumber++;
  await db
    .update(schema.projectTable)
    .set({ lastTaskNumber: number })
    .where(eq(schema.projectTable.id, projectId));
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      id: `raw-task-${number}`,
      projectId,
      title: "Raw task",
      description: "",
      priority: "medium",
      status: "to-do",
      number,
      position: number,
      ...overrides,
    })
    .returning();
  if (!task) throw new Error("Failed to seed raw task");
  return task;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

async function keyAccount(
  workspaceId: string,
  userName: string,
  role: "member" | "viewer",
  scope?: Record<string, string[]>,
) {
  const account = await createWorkspaceMember({ userName });
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: account.user.id,
    role,
    joinedAt: new Date(),
  });
  const { key } = await auth.api.createApiKey({
    body: { userId: account.user.id, name: userName, permissions: scope },
  });
  return { account, key };
}

async function setup() {
  const { user, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Jaime",
  });
  const { project, columns } = await createProjectFixture({
    workspaceId: workspace.id,
  });
  const { account: roleAccount, key: roleKey } = await keyAccount(
    workspace.id,
    "coder",
    "member",
  );
  mockAuthenticatedSession(user);
  return {
    app: createApp().app,
    user,
    workspace,
    project,
    columns,
    roleKey,
    roleAccount,
  };
}

function createInitiative(
  app: App,
  projectId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.request(`/api/intelia/project/${projectId}/initiatives`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function patchInitiative(
  app: App,
  initiativeId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.request(`/api/intelia/initiative/${initiativeId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function closePlan(
  app: App,
  initiativeId: string,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return app.request(`/api/intelia/initiative/${initiativeId}/close-plan`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function putTaskInitiative(
  app: App,
  taskId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.request(`/api/intelia/task/${taskId}/initiative`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function deleteInitiative(
  app: App,
  initiativeId: string,
  body?: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.request(`/api/intelia/initiative/${initiativeId}`, {
    method: "DELETE",
    headers:
      body === undefined
        ? headers
        : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function setStoredStatus(taskId: string, status: string) {
  return db
    .update(schema.taskTable)
    .set({ status })
    .where(eq(schema.taskTable.id, taskId));
}

function createTask(
  app: App,
  projectId: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return app.request(`/api/task/${projectId}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      title: "Tarea de prueba",
      description: "",
      priority: "medium",
      status: "to-do",
      type: "diseno",
      ...extra,
    }),
  });
}

function updateTaskStatus(
  app: App,
  taskId: string,
  status: string,
  headers: Record<string, string> = {},
) {
  return app.request(`/api/task/status/${taskId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ status }),
  });
}

function duplicateTask(
  app: App,
  taskId: string,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return app.request(`/api/task/duplicate/${taskId}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function importTasks(
  app: App,
  projectId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.request(`/api/task/import/${projectId}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function moveTask(
  app: App,
  taskId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.request(`/api/task/move/${taskId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function storedTaskInitiative(taskId: string) {
  return db
    .select()
    .from(taskInitiativeTable)
    .where(eq(taskInitiativeTable.taskId, taskId));
}

function taskInitiativeChanges(taskId: string) {
  return db
    .select()
    .from(taskInitiativeChangeTable)
    .where(eq(taskInitiativeChangeTable.taskId, taskId))
    .orderBy(taskInitiativeChangeTable.changedAt);
}

function storedInitiative(initiativeId: string) {
  return db
    .select()
    .from(initiativeTable)
    .where(eq(initiativeTable.id, initiativeId));
}

function initiativeChanges(initiativeId: string) {
  return db
    .select()
    .from(initiativeChangeTable)
    .where(eq(initiativeChangeTable.initiativeId, initiativeId))
    .orderBy(initiativeChangeTable.changedAt);
}

async function taskCount() {
  return (await db.select().from(schema.taskTable)).length;
}

// A transaction that does `work` and then stays open, holding its locks,
// until the returned function commits it: one side of a deterministic
// interleaving.
async function holdTransaction(
  work: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => Promise<unknown>,
) {
  const gate = Promise.withResolvers<void>();
  const ready = Promise.withResolvers<void>();
  const done = db.transaction(async (tx) => {
    await work(tx);
    ready.resolve();
    await gate.promise;
  });
  await Promise.race([ready.promise, done]);
  return async () => {
    gate.resolve();
    await done;
  };
}

// Until some backend of this database waits on a lock: the request under test
// reached the lock the held transaction owns.
async function waitForLockWait() {
  await vi.waitFor(
    async () => {
      const result = await db.execute(
        sql`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
      );
      expect(Number(result.rows[0]?.n)).toBeGreaterThan(0);
    },
    { timeout: 5000, interval: 20 },
  );
}

describe("API integration: Intelia initiatives", () => {
  it("persists, reads, updates and clears initiative goals and external milestones", async () => {
    const { app, project } = await setup();
    const hitos = [
      {
        nombre: "Entrega",
        enlace: "https://example.com",
        estado: "pendiente",
        tarea: "T-1",
      },
    ];
    expect(
      (
        await createInitiative(app, project.id, {
          name: "Inválida",
          objetivo: "cualquier-tarea",
        })
      ).status,
    ).toBe(400);
    const createdResponse = await createInitiative(app, project.id, {
      name: "Iniciativa",
      hitos_externos: hitos,
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as { id: string };
    const task = await seedRawTask(project.id);
    const other = await seedRawTask(project.id);
    expect(
      (await patchInitiative(app, created.id, { objetivo: "missing" })).status,
    ).toBe(400);
    expect(
      (await patchInitiative(app, created.id, { objetivo: other.id })).status,
    ).toBe(400);
    expect(
      (await putTaskInitiative(app, task.id, { initiativeId: created.id }))
        .status,
    ).toBe(200);
    const updated = await patchInitiative(app, created.id, {
      objetivo: task.id,
    });
    expect(await updated.json()).toMatchObject({
      objetivo: task.id,
      hitos_externos: hitos,
    });
    const detail = await app.request(`/api/intelia/initiative/${created.id}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      objetivo: task.id,
      hitos_externos: hitos,
    });
    const listing = await app.request(
      `/api/intelia/project/${project.id}/initiatives`,
    );
    expect(await listing.json()).toMatchObject({
      initiatives: [{ objetivo: task.id, hitos_externos: hitos }],
    });
    const cleared = await patchInitiative(app, created.id, {
      objetivo: null,
      hitos_externos: null,
    });
    expect(await cleared.json()).toMatchObject({
      objetivo: null,
      hitos_externos: null,
    });
    const history = await db
      .select()
      .from(initiativeChangeTable)
      .where(eq(initiativeChangeTable.initiativeId, created.id));
    expect(
      history.some(
        (entry) =>
          entry.kind === "updated" &&
          entry.value.objetivo === null &&
          entry.value.hitos_externos === null,
      ),
    ).toBe(true);
    for (const body of [
      { objetivo: "   " },
      { hitos_externos: [{ nombre: "x", enlace: "x", estado: "otro" }] },
      { hitos_externos: [{ nombre: "", enlace: "x", estado: "hecho" }] },
      {
        hitos_externos: [
          { nombre: "x", enlace: "x", estado: "hecho", tarea: "" },
        ],
      },
    ]) {
      expect((await patchInitiative(app, created.id, body)).status).toBe(400);
    }
  });
  it("clears the objective and records it when the task moves or is deleted", async () => {
    const { app, project, user } = await setup();
    const a = (await (
      await createInitiative(app, project.id, { name: "A" })
    ).json()) as { id: string };
    const b = (await (
      await createInitiative(app, project.id, { name: "B" })
    ).json()) as { id: string };
    const task = await seedRawTask(project.id);
    await putTaskInitiative(app, task.id, { initiativeId: a.id });
    expect(
      (await patchInitiative(app, a.id, { objetivo: task.id })).status,
    ).toBe(200);
    expect(
      (await putTaskInitiative(app, task.id, { initiativeId: b.id })).status,
    ).toBe(200);
    expect(
      await (await app.request(`/api/intelia/initiative/${a.id}`)).json(),
    ).toMatchObject({ objetivo: null });
    expect(
      (await patchInitiative(app, a.id, { objetivo: task.id })).status,
    ).toBe(400);
    expect(
      (await patchInitiative(app, b.id, { objetivo: task.id })).status,
    ).toBe(200);
    await db.delete(schema.taskTable).where(eq(schema.taskTable.id, task.id));
    expect(
      await (await app.request(`/api/intelia/initiative/${b.id}`)).json(),
    ).toMatchObject({ objetivo: null });
    for (const initiative of [a, b]) {
      const history = await db
        .select()
        .from(initiativeChangeTable)
        .where(eq(initiativeChangeTable.initiativeId, initiative.id));
      expect(
        history.some(
          (entry) =>
            entry.source === "auto" &&
            entry.previous?.objetivo === task.id &&
            entry.value.objetivo === null,
        ),
      ).toBe(true);
    }
    const moved = await seedRawTask(project.id);
    await putTaskInitiative(app, moved.id, { initiativeId: a.id });
    expect(
      (await patchInitiative(app, a.id, { objetivo: moved.id })).status,
    ).toBe(200);
    await db.transaction((tx) =>
      dropTaskInitiativeOnProjectMove(tx, moved.id, user.id),
    );
    expect(
      await (await app.request(`/api/intelia/initiative/${a.id}`)).json(),
    ).toMatchObject({ objetivo: null });
  });

  it("serializes setting an objective with a concurrent membership removal", async () => {
    const { app, project } = await setup();
    const init = (await (
      await createInitiative(app, project.id, { name: "Carrera" })
    ).json()) as { id: string };
    const task = await seedRawTask(project.id);
    await putTaskInitiative(app, task.id, { initiativeId: init.id });
    const commit = await holdTransaction((tx) =>
      tx
        .delete(taskInitiativeTable)
        .where(eq(taskInitiativeTable.taskId, task.id)),
    );
    const pending = patchInitiative(app, init.id, { objetivo: task.id });
    try {
      await waitForLockWait();
    } finally {
      await commit();
    }
    expect((await pending).status).toBe(400);
    expect(
      await (await app.request(`/api/intelia/initiative/${init.id}`)).json(),
    ).toMatchObject({ objetivo: null });
  });

  it("rejects task creation without initiative or with unknown initiative, creating nothing, and accepts one of another project of the workspace", async () => {
    const { app, project, workspace } = await setup();

    // 1. Without initiative -> 400 VALIDATION_ERROR path body.initiative
    const withoutInit = await createTask(app, project.id, {});
    expect(withoutInit.status).toBe(400);
    expect(await readErrorBody(withoutInit)).toMatchObject({
      code: "VALIDATION_ERROR",
      issues: [expect.objectContaining({ path: "body.initiative" })],
    });
    expect(await taskCount()).toBe(0);

    // 2. Unknown initiative id -> 400 INITIATIVE_NOT_FOUND
    const unknownInit = await createTask(app, project.id, {
      initiative: { id: "non-existent-initiative-id" },
    });
    expect(unknownInit.status).toBe(400);
    expect(await readErrorBody(unknownInit)).toMatchObject({
      code: "INITIATIVE_NOT_FOUND",
    });
    expect(await taskCount()).toBe(0);

    // 3. Initiative of another project of the workspace -> created in it
    // (design 52 §3.1).
    const otherProject = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Other Project",
    });
    const foreignInitRes = await createInitiative(
      app,
      otherProject.project.id,
      {
        name: "Iniciativa de otro proyecto",
      },
    );
    expect(foreignInitRes.status).toBe(201);
    const foreignInit = (await foreignInitRes.json()) as { id: string };

    const foreignInitTask = await createTask(app, project.id, {
      initiative: { id: foreignInit.id },
    });
    expect(foreignInitTask.status).toBe(200);
    expect(await taskCount()).toBe(1);
  });

  it("assigns origin plan before close-plan and añadido after, recording journal rows with source session", async () => {
    const { app, project, user } = await setup();

    const initRes = await createInitiative(app, project.id, {
      name: "Iniciativa Ciclo Plan",
    });
    expect(initRes.status).toBe(201);
    const initiative = (await initRes.json()) as { id: string };

    // Task created before the plan closes -> origin plan
    const task1Res = await createTask(app, project.id, {
      title: "Tarea en plan",
      initiative: { id: initiative.id },
    });
    expect(task1Res.status).toBe(200);
    const task1 = (await task1Res.json()) as { id: string };

    const [task1Init] = await storedTaskInitiative(task1.id);
    expect(task1Init).toMatchObject({
      initiativeId: initiative.id,
      origin: "plan",
      source: "session",
      setByUserId: user.id,
    });

    const task1Changes = await taskInitiativeChanges(task1.id);
    expect(task1Changes).toEqual([
      expect.objectContaining({
        previousInitiativeId: null,
        previousOrigin: null,
        initiativeId: initiative.id,
        origin: "plan",
        source: "session",
        changedByUserId: user.id,
      }),
    ]);

    // Close the plan
    const closeRes = await closePlan(app, initiative.id);
    expect(closeRes.status).toBe(200);
    const closedInit = (await closeRes.json()) as {
      planClosedAt: string | null;
    };
    expect(closedInit.planClosedAt).not.toBeNull();

    const initChanges = await initiativeChanges(initiative.id);
    expect(initChanges).toContainEqual(
      expect.objectContaining({
        kind: "plan_closed",
        source: "session",
        changedByUserId: user.id,
        taskId: null,
      }),
    );

    // Task created after the plan closes -> origin añadido
    const task2Res = await createTask(app, project.id, {
      title: "Tarea añadida",
      initiative: { id: initiative.id },
    });
    expect(task2Res.status).toBe(200);
    const task2 = (await task2Res.json()) as { id: string };

    const [task2Init] = await storedTaskInitiative(task2.id);
    expect(task2Init).toMatchObject({
      initiativeId: initiative.id,
      origin: "añadido",
      source: "session",
      setByUserId: user.id,
    });

    const task2Changes = await taskInitiativeChanges(task2.id);
    expect(task2Changes).toEqual([
      expect.objectContaining({
        previousInitiativeId: null,
        previousOrigin: null,
        initiativeId: initiative.id,
        origin: "añadido",
        source: "session",
        changedByUserId: user.id,
      }),
    ]);
  });

  it("automatically closes plan when a task reaches in-progress (subsequent tasks become añadido) and preserves origin plan for a task created in-progress", async () => {
    const { app, project } = await setup();

    // Case A: Moving an existing task to in-progress closes the plan asynchronously
    const init1Res = await createInitiative(app, project.id, {
      name: "Iniciativa Auto Cierre Movimiento",
    });
    expect(init1Res.status).toBe(201);
    const init1 = (await init1Res.json()) as { id: string };

    const taskARes = await createTask(app, project.id, {
      title: "Tarea A",
      status: "to-do",
      initiative: { id: init1.id },
    });
    expect(taskARes.status).toBe(200);
    const taskA = (await taskARes.json()) as { id: string };

    const statusRes = await updateTaskStatus(app, taskA.id, "in-progress");
    expect(statusRes.status).toBe(200);

    await vi.waitFor(async () => {
      const [initRow] = await storedInitiative(init1.id);
      expect(initRow?.planClosedAt).not.toBeNull();
      const changes = await initiativeChanges(init1.id);
      expect(changes).toContainEqual(
        expect.objectContaining({
          kind: "plan_closed",
          source: "auto",
          taskId: taskA.id,
        }),
      );
    });

    // Task created afterwards in init1 is añadido
    const taskBRes = await createTask(app, project.id, {
      title: "Tarea B",
      initiative: { id: init1.id },
    });
    expect(taskBRes.status).toBe(200);
    const taskB = (await taskBRes.json()) as { id: string };
    const [taskBInit] = await storedTaskInitiative(taskB.id);
    expect(taskBInit?.origin).toBe("añadido");

    // Case B: Task created directly with status in-progress closes the plan and itself stays plan
    const init2Res = await createInitiative(app, project.id, {
      name: "Iniciativa Auto Cierre Creacion Directa",
    });
    expect(init2Res.status).toBe(201);
    const init2 = (await init2Res.json()) as { id: string };

    const taskCRes = await createTask(app, project.id, {
      title: "Tarea C directa en progreso",
      status: "in-progress",
      initiative: { id: init2.id },
    });
    expect(taskCRes.status).toBe(200);
    const taskC = (await taskCRes.json()) as { id: string };

    const [taskCInit] = await storedTaskInitiative(taskC.id);
    expect(taskCInit?.origin).toBe("plan");

    await vi.waitFor(async () => {
      const [initRow] = await storedInitiative(init2.id);
      expect(initRow?.planClosedAt).not.toBeNull();
      const changes = await initiativeChanges(init2.id);
      expect(changes).toContainEqual(
        expect.objectContaining({
          kind: "plan_closed",
          source: "auto",
          taskId: taskC.id,
        }),
      );
    });

    const taskDRes = await createTask(app, project.id, {
      title: "Tarea D posterior",
      initiative: { id: init2.id },
    });
    expect(taskDRes.status).toBe(200);
    const taskD = (await taskDRes.json()) as { id: string };
    const [taskDInit] = await storedTaskInitiative(taskD.id);
    expect(taskDInit?.origin).toBe("añadido");
  });

  it("inherits parent initiative for subtasks via parentTaskId, and validates parent presence and initiative", async () => {
    const { app, project, workspace } = await setup();

    const initRes = await createInitiative(app, project.id, {
      name: "Iniciativa Subtareas",
    });
    expect(initRes.status).toBe(201);
    const initiative = (await initRes.json()) as { id: string };

    // Parent task with initiative
    const parentRes = await createTask(app, project.id, {
      title: "Tarea Padre",
      initiative: { id: initiative.id },
    });
    expect(parentRes.status).toBe(200);
    const parent = (await parentRes.json()) as { id: string };

    // Subtask inheriting parent's initiative
    const subtaskRes = await createTask(app, project.id, {
      title: "Subtarea Hija",
      initiative: { parentTaskId: parent.id },
    });
    expect(subtaskRes.status).toBe(200);
    const subtask = (await subtaskRes.json()) as { id: string };
    const [subtaskInit] = await storedTaskInitiative(subtask.id);
    expect(subtaskInit).toMatchObject({
      initiativeId: initiative.id,
      origin: "plan",
    });

    // Parent without initiative -> 400 PARENT_WITHOUT_INITIATIVE
    const rawParent = await seedRawTask(project.id, {
      title: "Padre sin iniciativa",
    });

    const invalidParentRes = await createTask(app, project.id, {
      title: "Subtarea de padre sin iniciativa",
      initiative: { parentTaskId: rawParent.id },
    });
    expect(invalidParentRes.status).toBe(400);
    expect(await readErrorBody(invalidParentRes)).toMatchObject({
      code: "PARENT_WITHOUT_INITIATIVE",
    });

    // Nonexistent parent -> 400 PARENT_TASK_NOT_FOUND
    const missingParentRes = await createTask(app, project.id, {
      title: "Subtarea de padre inexistente",
      initiative: { parentTaskId: "non-existent-parent-task-id" },
    });
    expect(missingParentRes.status).toBe(400);
    expect(await readErrorBody(missingParentRes)).toMatchObject({
      code: "PARENT_TASK_NOT_FOUND",
    });

    // A parent in another project of the workspace passes on its initiative
    // (design 52 §3.1).
    const otherProject = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Otro proyecto",
      slug: "OTRO",
    });
    const otherInitRes = await createInitiative(app, otherProject.project.id, {
      name: "Iniciativa ajena",
    });
    const otherInit = (await otherInitRes.json()) as { id: string };
    const foreignParentRes = await createTask(app, otherProject.project.id, {
      title: "Padre ajeno",
      initiative: { id: otherInit.id },
    });
    expect(foreignParentRes.status).toBe(200);
    const foreignParent = (await foreignParentRes.json()) as { id: string };
    const foreignChildRes = await createTask(app, project.id, {
      title: "Subtarea de padre de otro proyecto",
      initiative: { parentTaskId: foreignParent.id },
    });
    expect(foreignChildRes.status).toBe(200);
    const foreignChild = (await foreignChildRes.json()) as { id: string };
    expect(await storedTaskInitiative(foreignChild.id)).toEqual([
      expect.objectContaining({ initiativeId: otherInit.id }),
    ]);

    // A parent of another workspace answers like one that does not exist.
    const stranger = await createWorkspaceMember({ userName: "Ajeno" });
    const strangerProject = await createProjectFixture({
      workspaceId: stranger.workspace.id,
      name: "Proyecto de otro espacio",
      slug: "AJENO",
    });
    const strangerParent = await seedRawTask(strangerProject.project.id);
    const strangerChildRes = await createTask(app, project.id, {
      title: "Subtarea de padre de otro espacio",
      initiative: { parentTaskId: strangerParent.id },
    });
    expect(strangerChildRes.status).toBe(400);
    expect(await readErrorBody(strangerChildRes)).toMatchObject({
      code: "PARENT_TASK_NOT_FOUND",
    });
  });

  it("closes the plan in the transition's own transaction, even if the task leaves In progress at once", async () => {
    const { app, project } = await setup();
    const init = (await (
      await createInitiative(app, project.id, { name: "Transición rápida" })
    ).json()) as { id: string };
    const task = (await (
      await createTask(app, project.id, { initiative: { id: init.id } })
    ).json()) as { id: string };

    // In progress and straight out again, each committed on its own and with
    // no event at all: the way any path (bulk, reorder, an integration, a
    // routine) may write the status before anyone looks at it.
    for (const status of ["in-progress", "done"]) {
      await db
        .update(schema.taskTable)
        .set({ status })
        .where(eq(schema.taskTable.id, task.id));
    }

    // No waiting: the close committed with the status change.
    const [stored] = await storedInitiative(init.id);
    expect(stored?.planClosedAt).not.toBeNull();
    expect(await initiativeChanges(init.id)).toContainEqual(
      expect.objectContaining({
        kind: "plan_closed",
        source: "auto",
        taskId: task.id,
        changedByUserId: null,
      }),
    );
    const later = (await (
      await createTask(app, project.id, { initiative: { id: init.id } })
    ).json()) as { id: string };
    const [membership] = await storedTaskInitiative(later.id);
    expect(membership?.origin).toBe("añadido");
  });

  it("orders an assignment after a transition that is closing the plan", async () => {
    const { app, project } = await setup();
    const init = (await (
      await createInitiative(app, project.id, { name: "Carrera con el cierre" })
    ).json()) as { id: string };
    const started = (await (
      await createTask(app, project.id, { initiative: { id: init.id } })
    ).json()) as { id: string };

    // The transition writes the status and holds the initiative's lock.
    const commit = await holdTransaction((tx) =>
      tx
        .update(schema.taskTable)
        .set({ status: "in-progress" })
        .where(eq(schema.taskTable.id, started.id)),
    );
    const pending = createTask(app, project.id, {
      title: "Creada durante la transición",
      initiative: { id: init.id },
    });
    try {
      await waitForLockWait();
    } finally {
      await commit();
    }

    const res = await pending;
    expect(res.status).toBe(200);
    const created = (await res.json()) as { id: string };
    const [membership] = await storedTaskInitiative(created.id);
    expect(membership?.origin).toBe("añadido");
    const closes = (await initiativeChanges(init.id)).filter(
      (change) => change.kind === "plan_closed",
    );
    expect(closes).toEqual([
      expect.objectContaining({ source: "auto", taskId: started.id }),
    ]);
  });

  it("does not close the plan of the project a task leaves for In progress elsewhere", async () => {
    const { app, project, workspace } = await setup();
    const init = (await (
      await createInitiative(app, project.id, { name: "Origen del traslado" })
    ).json()) as { id: string };
    const task = (await (
      await createTask(app, project.id, { initiative: { id: init.id } })
    ).json()) as { id: string };
    const destination = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Destino",
      slug: "DEST",
    });

    const res = await moveTask(app, task.id, {
      destinationProjectId: destination.project.id,
      destinationStatus: "in-progress",
    });
    expect(res.status).toBe(200);
    const [stored] = await storedInitiative(init.id);
    expect(stored?.planClosedAt).toBeNull();
  });

  it("validates an assignment against the project a concurrent move leaves the task in", async () => {
    const { app, project, user } = await setup();
    const source = (await (
      await createInitiative(app, project.id, { name: "Antes del traslado" })
    ).json()) as { id: string };
    const target = (await (
      await createInitiative(app, project.id, { name: "Destino de la carrera" })
    ).json()) as { id: string };
    const task = (await (
      await createTask(app, project.id, { initiative: { id: source.id } })
    ).json()) as { id: string };
    // Another workspace: the one place an initiative still cannot be.
    const stranger = await createWorkspaceMember({ userName: "Ajeno" });
    const destination = await createProjectFixture({
      workspaceId: stranger.workspace.id,
      name: "Proyecto destino",
      slug: "PDEST",
    });

    // What the move does in its transaction: update the task's row (its row
    // lock) and drop the initiative of the project it leaves.
    const commit = await holdTransaction(async (tx) => {
      await tx
        .update(schema.taskTable)
        .set({ projectId: destination.project.id })
        .where(eq(schema.taskTable.id, task.id));
      await dropTaskInitiativeOnProjectMove(tx, task.id, user.id);
    });
    const pending = putTaskInitiative(app, task.id, {
      initiativeId: target.id,
    });
    try {
      await waitForLockWait();
    } finally {
      await commit();
    }

    const res = await pending;
    expect(res.status).toBe(400);
    expect(await readErrorBody(res)).toMatchObject({
      code: "INITIATIVE_NOT_FOUND",
    });
    expect(await storedTaskInitiative(task.id)).toEqual([]);
    const [last] = (await taskInitiativeChanges(task.id)).slice(-1);
    expect(last).toMatchObject({ source: "project_move", initiativeId: null });
  });

  it("moves a task between initiatives recomputing origin (open plan -> plan, closed plan -> añadido) with journal rows, and is idempotent on same initiative", async () => {
    const { app, project, user } = await setup();

    const initARes = await createInitiative(app, project.id, {
      name: "Iniciativa A",
    });
    const initA = (await initARes.json()) as { id: string };

    const initBRes = await createInitiative(app, project.id, {
      name: "Iniciativa B",
    });
    const initB = (await initBRes.json()) as { id: string };
    await closePlan(app, initB.id);

    const initCRes = await createInitiative(app, project.id, {
      name: "Iniciativa C",
    });
    const initC = (await initCRes.json()) as { id: string };

    // Create task in A (open plan -> origin plan)
    const taskRes = await createTask(app, project.id, {
      title: "Tarea Movible",
      initiative: { id: initA.id },
    });
    expect(taskRes.status).toBe(200);
    const task = (await taskRes.json()) as { id: string };

    // Move to B (closed plan -> origin añadido)
    const move1Res = await putTaskInitiative(app, task.id, {
      initiativeId: initB.id,
    });
    expect(move1Res.status).toBe(200);
    const move1Body = (await move1Res.json()) as {
      origin: string;
      initiativeId: string;
    };
    expect(move1Body.initiativeId).toBe(initB.id);
    expect(move1Body.origin).toBe("añadido");

    const [storedB] = await storedTaskInitiative(task.id);
    expect(storedB).toMatchObject({
      initiativeId: initB.id,
      origin: "añadido",
      source: "session",
      setByUserId: user.id,
    });

    const changesAfter1 = await taskInitiativeChanges(task.id);
    expect(changesAfter1).toHaveLength(2);
    expect(changesAfter1[1]).toMatchObject({
      previousInitiativeId: initA.id,
      previousOrigin: "plan",
      initiativeId: initB.id,
      origin: "añadido",
      source: "session",
      changedByUserId: user.id,
    });

    // Move to C (open plan -> origin plan)
    const move2Res = await putTaskInitiative(app, task.id, {
      initiativeId: initC.id,
    });
    expect(move2Res.status).toBe(200);
    const move2Body = (await move2Res.json()) as {
      origin: string;
      initiativeId: string;
    };
    expect(move2Body.initiativeId).toBe(initC.id);
    expect(move2Body.origin).toBe("plan");

    const changesAfter2 = await taskInitiativeChanges(task.id);
    expect(changesAfter2).toHaveLength(3);
    expect(changesAfter2[2]).toMatchObject({
      previousInitiativeId: initB.id,
      previousOrigin: "añadido",
      initiativeId: initC.id,
      origin: "plan",
    });

    // Move to same initiative (C) -> 200, no new journal row
    const moveSameRes = await putTaskInitiative(app, task.id, {
      initiativeId: initC.id,
    });
    expect(moveSameRes.status).toBe(200);
    const changesAfterSame = await taskInitiativeChanges(task.id);
    expect(changesAfterSame).toHaveLength(3);
  });

  it("enforces write auth across all four write endpoints (role account key writes with actor, viewer/read-scope 403, 401 unauth/unknown/service token, 400 session actor, no journal on rejection)", async () => {
    const { app, project, workspace, user, roleKey, roleAccount } =
      await setup();

    // Accounts for auth boundary tests
    const viewer = await keyAccount(workspace.id, "viewer", "viewer");
    const readOnly = await keyAccount(workspace.id, "reader", "member", {
      task: ["read"],
    });

    // Pre-create all targets upfront under the authenticated owner session
    // For PATCH:
    const patchInitRes = await createInitiative(app, project.id, {
      name: "Iniciativa Auth Patch Target",
    });
    expect(patchInitRes.status).toBe(201);
    const patchInit = (await patchInitRes.json()) as { id: string };

    // For Close Plan:
    const closeInit1Res = await createInitiative(app, project.id, {
      name: "Iniciativa Auth Close Target 1",
    });
    expect(closeInit1Res.status).toBe(201);
    const closeInit1 = (await closeInit1Res.json()) as { id: string };

    const closeInit2Res = await createInitiative(app, project.id, {
      name: "Iniciativa Auth Close Target 2",
    });
    expect(closeInit2Res.status).toBe(201);
    const closeInit2 = (await closeInit2Res.json()) as { id: string };

    const closeInitRejectRes = await createInitiative(app, project.id, {
      name: "Iniciativa Auth Close Target Reject",
    });
    expect(closeInitRejectRes.status).toBe(201);
    const closeInitReject = (await closeInitRejectRes.json()) as { id: string };

    // For Move Task:
    const moveSourceInitRes = await createInitiative(app, project.id, {
      name: "Iniciativa Auth Move Source",
    });
    expect(moveSourceInitRes.status).toBe(201);
    const moveSourceInit = (await moveSourceInitRes.json()) as { id: string };

    const moveTaskRes = await createTask(app, project.id, {
      title: "Tarea Auth Move Target",
      initiative: { id: moveSourceInit.id },
    });
    expect(moveTaskRes.status).toBe(200);
    const moveTask = (await moveTaskRes.json()) as { id: string };

    const moveTarget1Res = await createInitiative(app, project.id, {
      name: "Iniciativa Auth Move Target 1",
    });
    expect(moveTarget1Res.status).toBe(201);
    const moveTarget1 = (await moveTarget1Res.json()) as { id: string };

    const moveTarget2Res = await createInitiative(app, project.id, {
      name: "Iniciativa Auth Move Target 2",
    });
    expect(moveTarget2Res.status).toBe(201);
    const moveTarget2 = (await moveTarget2Res.json()) as { id: string };

    const moveTargetRejectRes = await createInitiative(app, project.id, {
      name: "Iniciativa Auth Move Target Reject",
    });
    expect(moveTargetRejectRes.status).toBe(201);
    const moveTargetReject = (await moveTargetRejectRes.json()) as {
      id: string;
    };

    const countInitJournal = async () =>
      (await db.select().from(initiativeChangeTable)).length;
    const countTaskJournal = async () =>
      (await db.select().from(taskInitiativeChangeTable)).length;
    // The newest row of the endpoint's change log: who wrote it, and how.
    const latestAuthor = async (journal: () => Promise<number>) => {
      const table =
        journal === countTaskJournal
          ? taskInitiativeChangeTable
          : initiativeChangeTable;
      const [row] = await db
        .select({
          userId: table.changedByUserId,
          actor: table.changedByActor,
          source: table.source,
        })
        .from(table)
        .orderBy(desc(table.changedAt), desc(table.id))
        .limit(1);
      return row;
    };

    type EndpointDefinition = {
      name: string;
      expectedSuccessStatus: 200 | 201;
      callWrite: (
        headers: Record<string, string>,
        bodyExtra?: Record<string, unknown>,
      ) => Response | Promise<Response>;
      callReject: (
        headers: Record<string, string>,
      ) => Response | Promise<Response>;
      callSessionActor: () => Response | Promise<Response>;
      countJournal: () => Promise<number>;
    };

    let createCounter = 0;
    let patchCounter = 0;
    const endpoints: EndpointDefinition[] = [
      {
        name: "POST /project/:projectId/initiatives",
        expectedSuccessStatus: 201,
        callWrite: async (headers, extra = {}) =>
          createInitiative(
            app,
            project.id,
            { name: `Iniciativa Write Auth ${++createCounter}`, ...extra },
            headers,
          ),
        callReject: async (headers) =>
          createInitiative(
            app,
            project.id,
            { name: `Iniciativa Reject ${++createCounter}` },
            headers,
          ),
        callSessionActor: async () =>
          createInitiative(app, project.id, {
            name: `Iniciativa Session Actor ${++createCounter}`,
            actor: DECLARED,
          }),
        countJournal: countInitJournal,
      },
      {
        name: "PATCH /initiative/:initiativeId",
        expectedSuccessStatus: 200,
        callWrite: async (headers, extra = {}) =>
          patchInitiative(
            app,
            patchInit.id,
            {
              designUrl: `https://example.com/spec-${++patchCounter}`,
              ...extra,
            },
            headers,
          ),
        callReject: async (headers) =>
          patchInitiative(
            app,
            patchInit.id,
            { designUrl: "https://example.com/rejected" },
            headers,
          ),
        callSessionActor: async () =>
          patchInitiative(app, patchInit.id, {
            designUrl: "https://example.com/session-actor",
            actor: DECLARED,
          }),
        countJournal: countInitJournal,
      },
      {
        name: "POST /initiative/:initiativeId/close-plan",
        expectedSuccessStatus: 200,
        callWrite: async (headers, extra = {}) => {
          const targetId =
            extra.actor === DECLARED ? closeInit1.id : closeInit2.id;
          return closePlan(app, targetId, extra, headers);
        },
        callReject: async (headers) =>
          closePlan(app, closeInitReject.id, {}, headers),
        callSessionActor: async () =>
          closePlan(app, closeInitReject.id, { actor: DECLARED }),
        countJournal: countInitJournal,
      },
      {
        name: "PUT /task/:taskId/initiative",
        expectedSuccessStatus: 200,
        callWrite: async (headers, extra = {}) => {
          const targetId =
            extra.actor === DECLARED ? moveTarget1.id : moveTarget2.id;
          return putTaskInitiative(
            app,
            moveTask.id,
            { initiativeId: targetId, ...extra },
            headers,
          );
        },
        callReject: async (headers) =>
          putTaskInitiative(
            app,
            moveTask.id,
            { initiativeId: moveTargetReject.id },
            headers,
          ),
        callSessionActor: async () =>
          putTaskInitiative(app, moveTask.id, {
            initiativeId: moveTargetReject.id,
            actor: DECLARED,
          }),
        countJournal: countTaskJournal,
      },
    ];

    for (const ep of endpoints) {
      // 1. Member account API key WITH task:update writes successfully with valid actor
      vi.restoreAllMocks();
      mockAnonymousSession();
      const validKeyRes = await ep.callWrite(
        { "x-api-key": roleKey },
        { actor: DECLARED },
      );
      expect(
        validKeyRes.status,
        `${ep.name}: member key with task:update should write`,
      ).toBe(ep.expectedSuccessStatus);
      expect(await latestAuthor(ep.countJournal), ep.name).toEqual({
        userId: roleAccount.user.id,
        actor: DECLARED,
        source: "api_key",
      });

      // 2. Member account API key with INVALID actor ignores actor (stores null)
      const invalidActorRes = await ep.callWrite(
        { "x-api-key": roleKey },
        { actor: "invalid_actor_format!!!" },
      );
      expect(
        invalidActorRes.status,
        `${ep.name}: member key with invalid actor should still write`,
      ).toBe(ep.expectedSuccessStatus);
      expect(await latestAuthor(ep.countJournal), ep.name).toEqual({
        userId: roleAccount.user.id,
        actor: null,
        source: "api_key",
      });

      // 3. Viewer account key -> 403, no journal rows written
      const journalBeforeViewer = await ep.countJournal();
      const viewerRes = await ep.callReject({ "x-api-key": viewer.key });
      expect(viewerRes.status, `${ep.name}: viewer key should return 403`).toBe(
        403,
      );
      expect(
        await ep.countJournal(),
        `${ep.name}: no journal on viewer 403`,
      ).toBe(journalBeforeViewer);

      // 4. Key whose scope is task:read -> 403, no journal rows written
      const journalBeforeReadScope = await ep.countJournal();
      const readScopeRes = await ep.callReject({ "x-api-key": readOnly.key });
      expect(
        readScopeRes.status,
        `${ep.name}: read-scope key should return 403`,
      ).toBe(403);
      expect(
        await ep.countJournal(),
        `${ep.name}: no journal on read-scope 403`,
      ).toBe(journalBeforeReadScope);

      // 5. No credentials -> 401, no journal rows written
      const journalBeforeNoCreds = await ep.countJournal();
      const noCredsRes = await ep.callReject({});
      expect(noCredsRes.status, `${ep.name}: no creds should return 401`).toBe(
        401,
      );
      expect(
        await ep.countJournal(),
        `${ep.name}: no journal on no-creds 401`,
      ).toBe(journalBeforeNoCreds);

      // 6. Unknown key -> 401, no journal rows written
      const journalBeforeUnknownKey = await ep.countJournal();
      const unknownKeyRes = await ep.callReject({
        "x-api-key": "unknown-api-key",
      });
      expect(
        unknownKeyRes.status,
        `${ep.name}: unknown key should return 401`,
      ).toBe(401);
      expect(
        await ep.countJournal(),
        `${ep.name}: no journal on unknown key 401`,
      ).toBe(journalBeforeUnknownKey);

      // 7. X-Service-Token with INTELIA_GATEWAY_TOKEN stubbed and no session -> 401, no journal
      const journalBeforeServiceToken = await ep.countJournal();
      const serviceTokenRes = await ep.callReject({
        "x-service-token": FORMER_TOKEN,
      });
      expect(
        serviceTokenRes.status,
        `${ep.name}: X-Service-Token without session should return 401`,
      ).toBe(401);
      expect(
        await ep.countJournal(),
        `${ep.name}: no journal on service token 401`,
      ).toBe(journalBeforeServiceToken);

      // 8. Session sending a valid actor -> 400 VALIDATION_ERROR, no journal rows written
      // Reuse the original owner who has access to the workspace and project
      vi.restoreAllMocks();
      mockAuthenticatedSession(user);
      const journalBeforeSessionActor = await ep.countJournal();
      const sessionActorRes = await ep.callSessionActor();
      expect(
        sessionActorRes.status,
        `${ep.name}: session with actor should return 400`,
      ).toBe(400);
      expect(await readErrorBody(sessionActorRes)).toMatchObject({
        code: "VALIDATION_ERROR",
        issues: [expect.objectContaining({ path: "body.actor" })],
      });
      expect(
        await ep.countJournal(),
        `${ep.name}: no journal on session actor 400`,
      ).toBe(journalBeforeSessionActor);
    }
  });

  it("handles initiative create/edit uniqueness (409 on duplicate name across case/accents/spaces, ok in another project), logs only changed fields on PATCH, adds no row when unchanged, and close-plan is idempotent", async () => {
    const { app, project, workspace } = await setup();

    // 1. Create first initiative
    const firstRes = await createInitiative(app, project.id, {
      name: "Motor de flujo",
    });
    expect(firstRes.status).toBe(201);

    // 2. Duplicate names differing only in case/accents/spaces -> 409 INITIATIVE_NAME_TAKEN
    const dupSpaceCaseRes = await createInitiative(app, project.id, {
      name: "  motor de FLUJO ",
    });
    expect(dupSpaceCaseRes.status).toBe(409);
    expect(await readErrorBody(dupSpaceCaseRes)).toMatchObject({
      code: "INITIATIVE_NAME_TAKEN",
    });

    const dupAccentRes = await createInitiative(app, project.id, {
      name: "Motor dé flujo",
    });
    expect(dupAccentRes.status).toBe(409);
    expect(await readErrorBody(dupAccentRes)).toMatchObject({
      code: "INITIATIVE_NAME_TAKEN",
    });

    // 3. Same name in another project is allowed
    const otherProject = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Segundo Proyecto",
    });
    const otherProjectRes = await createInitiative(
      app,
      otherProject.project.id,
      {
        name: "Motor de flujo",
      },
    );
    expect(otherProjectRes.status).toBe(201);

    // 4. PATCH duplicate name against an existing initiative -> 409
    const secondInitRes = await createInitiative(app, project.id, {
      name: "Segunda Iniciativa",
    });
    expect(secondInitRes.status).toBe(201);
    const secondInit = (await secondInitRes.json()) as { id: string };

    const renameConflictRes = await patchInitiative(app, secondInit.id, {
      name: "mOTOR de flújo",
    });
    expect(renameConflictRes.status).toBe(409);
    expect(await readErrorBody(renameConflictRes)).toMatchObject({
      code: "INITIATIVE_NAME_TAKEN",
    });

    // 5. PATCH logs updated with only changed fields
    const testPatchInitRes = await createInitiative(app, project.id, {
      name: "Iniciativa Para Patch",
      designUrl: "https://example.com/spec-v1",
      approvedBy: "Jaime",
    });
    expect(testPatchInitRes.status).toBe(201);
    const testPatchInit = (await testPatchInitRes.json()) as { id: string };

    const patchRes = await patchInitiative(app, testPatchInit.id, {
      designUrl: "https://example.com/spec-v2",
    });
    expect(patchRes.status).toBe(200);

    const changes = await initiativeChanges(testPatchInit.id);
    expect(changes).toHaveLength(2); // created, updated
    expect(changes[1]).toMatchObject({
      kind: "updated",
      previous: { designUrl: "https://example.com/spec-v1" },
      value: { designUrl: "https://example.com/spec-v2" },
    });
    expect(changes[1].previous).not.toHaveProperty("name");
    expect(changes[1].previous).not.toHaveProperty("approvedBy");
    expect(changes[1].value).not.toHaveProperty("name");
    expect(changes[1].value).not.toHaveProperty("approvedBy");

    // 6. PATCH with no changes adds no row
    const noChangeRes = await patchInitiative(app, testPatchInit.id, {
      designUrl: "https://example.com/spec-v2",
    });
    expect(noChangeRes.status).toBe(200);
    const changesAfterNoChange = await initiativeChanges(testPatchInit.id);
    expect(changesAfterNoChange).toHaveLength(2);

    // 7. close-plan twice -> second call returns 200 without new journal row
    const close1Res = await closePlan(app, testPatchInit.id);
    expect(close1Res.status).toBe(200);
    const changesAfterClose1 = await initiativeChanges(testPatchInit.id);
    expect(changesAfterClose1).toHaveLength(3); // created, updated, plan_closed

    const close2Res = await closePlan(app, testPatchInit.id);
    expect(close2Res.status).toBe(200);
    const changesAfterClose2 = await initiativeChanges(testPatchInit.id);
    expect(changesAfterClose2).toHaveLength(3); // still 3
  });

  it("requires initiativeId on import assigning all tasks, and copies source initiative on duplicate (or errors if missing)", async () => {
    const { app, project } = await setup();

    const initRes = await createInitiative(app, project.id, {
      name: "Iniciativa Import y Duplicate",
    });
    expect(initRes.status).toBe(201);
    const initiative = (await initRes.json()) as { id: string };

    // 1. Import without initiativeId -> 400, no tasks created
    const missingImportInitRes = await importTasks(app, project.id, {
      tasks: [{ title: "Importada 1", status: "to-do", type: "diseno" }],
    });
    expect(missingImportInitRes.status).toBe(400);
    expect(await taskCount()).toBe(0);

    // 2. Import with initiativeId -> 200, all tasks assigned to the initiative
    const validImportRes = await importTasks(app, project.id, {
      initiativeId: initiative.id,
      tasks: [
        { title: "Importada 1", status: "to-do", type: "diseno" },
        { title: "Importada 2", status: "to-do", type: "diseno" },
      ],
    });
    expect(validImportRes.status).toBe(200);

    const importedTasks = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));
    expect(importedTasks).toHaveLength(2);

    for (const t of importedTasks) {
      const [tInit] = await storedTaskInitiative(t.id);
      expect(tInit).toMatchObject({
        initiativeId: initiative.id,
        origin: "plan",
      });
      const tChanges = await taskInitiativeChanges(t.id);
      expect(tChanges).toHaveLength(1);
    }

    // 3. Duplicate copies the source initiative when initiativeId is omitted
    const sourceTaskRes = await createTask(app, project.id, {
      title: "Tarea Origen Duplicado",
      initiative: { id: initiative.id },
    });
    expect(sourceTaskRes.status).toBe(200);
    const sourceTask = (await sourceTaskRes.json()) as { id: string };

    const dupWithoutInitRes = await duplicateTask(app, sourceTask.id, {});
    expect(dupWithoutInitRes.status).toBe(200);
    const dupWithoutInit = (await dupWithoutInitRes.json()) as { id: string };
    const [dupWithoutInitStored] = await storedTaskInitiative(
      dupWithoutInit.id,
    );
    expect(dupWithoutInitStored).toMatchObject({
      initiativeId: initiative.id,
      origin: "plan",
    });

    // 4. Duplicate with explicit initiativeId uses the given one
    const otherInitRes = await createInitiative(app, project.id, {
      name: "Iniciativa Alternativa Para Duplicado",
    });
    const otherInit = (await otherInitRes.json()) as { id: string };

    const dupWithInitRes = await duplicateTask(app, sourceTask.id, {
      initiativeId: otherInit.id,
    });
    expect(dupWithInitRes.status).toBe(200);
    const dupWithInit = (await dupWithInitRes.json()) as { id: string };
    const [dupWithInitStored] = await storedTaskInitiative(dupWithInit.id);
    expect(dupWithInitStored).toMatchObject({
      initiativeId: otherInit.id,
      origin: "plan",
    });

    // 5. Duplicate a source task without initiative and without initiativeId -> 400
    const rawTask = await seedRawTask(project.id, {
      title: "Tarea sin iniciativa",
    });

    const dupFailRes = await duplicateTask(app, rawTask.id, {});
    expect(dupFailRes.status).toBe(400);
    expect(await readErrorBody(dupFailRes)).toMatchObject({
      code: "VALIDATION_ERROR",
      issues: [expect.objectContaining({ path: "body.initiativeId" })],
    });
  });

  it("removes task initiative membership and logs a project_move journal row when moved to another project", async () => {
    const { app, project, workspace, user } = await setup();

    const initRes = await createInitiative(app, project.id, {
      name: "Iniciativa Proyecto Origen",
    });
    expect(initRes.status).toBe(201);
    const initiative = (await initRes.json()) as { id: string };

    const taskRes = await createTask(app, project.id, {
      title: "Tarea a Mudar",
      initiative: { id: initiative.id },
    });
    expect(taskRes.status).toBe(200);
    const task = (await taskRes.json()) as { id: string };

    const destProject = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Proyecto Destino Mudar",
    });

    // Move task to another project
    const moveRes = await moveTask(app, task.id, {
      destinationProjectId: destProject.project.id,
    });
    expect(moveRes.status).toBe(200);

    // Membership in task_initiative is removed
    const storedMembership = await storedTaskInitiative(task.id);
    expect(storedMembership).toHaveLength(0);

    // Journal logs project_move
    const changes = await taskInitiativeChanges(task.id);
    expect(changes).toHaveLength(2); // created, project_move
    expect(changes[1]).toMatchObject({
      taskId: task.id,
      previousInitiativeId: initiative.id,
      previousOrigin: "plan",
      initiativeId: null,
      origin: null,
      source: "project_move",
      changedByUserId: user.id,
    });
  });

  it("creates tasks without initiative under Pruebas de upstream when INTELIA_TASK_INITIATIVE_OPTIONAL is true", async () => {
    const { app, project } = await setup();
    vi.stubEnv("INTELIA_TASK_INITIATIVE_OPTIONAL", "true");

    // Creating task without initiative succeeds
    const task1Res = await createTask(app, project.id, {
      title: "Tarea Upstream 1",
    });
    expect(task1Res.status).toBe(200);
    const task1 = (await task1Res.json()) as { id: string };

    const [task1Init] = await storedTaskInitiative(task1.id);
    expect(task1Init).toBeDefined();

    const [upstreamInit] = await storedInitiative(task1Init.initiativeId);
    expect(upstreamInit.name).toBe("Pruebas de upstream");
    expect(upstreamInit.projectId).toBe(project.id);

    // Second task reuses the same Pruebas de upstream initiative
    const task2Res = await createTask(app, project.id, {
      title: "Tarea Upstream 2",
    });
    expect(task2Res.status).toBe(200);
    const task2 = (await task2Res.json()) as { id: string };

    const [task2Init] = await storedTaskInitiative(task2.id);
    expect(task2Init.initiativeId).toBe(upstreamInit.id);

    // Duplicating a task without initiative leaves copy without initiative
    const rawTask = await seedRawTask(project.id, {
      title: "Tarea cruda sin iniciativa",
    });

    const dupRes = await duplicateTask(app, rawTask.id, {});
    expect(dupRes.status).toBe(200);
    const dup = (await dupRes.json()) as { id: string };
    const dupInit = await storedTaskInitiative(dup.id);
    expect(dupInit).toHaveLength(0);
  });

  describe("DELETE /api/intelia/initiative/{initiativeId}", () => {
    async function initiativeWithTasks(
      app: App,
      projectId: string,
      name: string,
      statuses: string[],
    ) {
      const initRes = await createInitiative(app, projectId, { name });
      expect(initRes.status).toBe(201);
      const initiative = (await initRes.json()) as { id: string };
      const taskIds: string[] = [];
      for (const status of statuses) {
        const taskRes = await createTask(app, projectId, {
          initiative: { id: initiative.id },
        });
        expect(taskRes.status).toBe(200);
        const task = (await taskRes.json()) as { id: string };
        await setStoredStatus(task.id, status);
        taskIds.push(task.id);
      }
      return { initiative, taskIds };
    }

    async function snapshot(initiativeId: string, taskIds: string[]) {
      return {
        initiative: await storedInitiative(initiativeId),
        changes: await initiativeChanges(initiativeId),
        memberships: await Promise.all(taskIds.map(storedTaskInitiative)),
        taskChanges: await Promise.all(taskIds.map(taskInitiativeChanges)),
      };
    }

    it("deletes an initiative without tasks, with its change log, without a body", async () => {
      const { app, project } = await setup();
      const { initiative } = await initiativeWithTasks(
        app,
        project.id,
        "Iniciativa vacía",
        [],
      );

      const res = await deleteInitiative(app, initiative.id);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        id: initiative.id,
        projectId: project.id,
        name: "Iniciativa vacía",
        unlinkedTaskIds: [],
      });

      const detail = await app.request(
        `/api/intelia/initiative/${initiative.id}`,
      );
      expect(detail.status).toBe(404);
      expect(await storedInitiative(initiative.id)).toHaveLength(0);
      expect(await initiativeChanges(initiative.id)).toHaveLength(0);

      // An assignment that comes after finds no initiative.
      const taskRes = await createTask(app, project.id, {
        initiative: { id: initiative.id },
      });
      expect(taskRes.status).toBe(400);
      expect(await readErrorBody(taskRes)).toMatchObject({
        code: "INITIATIVE_NOT_FOUND",
      });
    });

    it("deletes an initiative with only cancelled tasks, which stay without initiative with a log row signed by the API key", async () => {
      const { app, project, roleKey, roleAccount } = await setup();
      const { initiative, taskIds } = await initiativeWithTasks(
        app,
        project.id,
        "Iniciativa cancelada",
        ["cancelled", "canceled"],
      );

      vi.restoreAllMocks();
      mockAnonymousSession();
      const res = await deleteInitiative(
        app,
        initiative.id,
        { actor: DECLARED },
        { "x-api-key": roleKey },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        id: initiative.id,
        projectId: project.id,
        name: "Iniciativa cancelada",
        unlinkedTaskIds: [...taskIds].sort(),
      });
      expect(await storedInitiative(initiative.id)).toHaveLength(0);

      for (const taskId of taskIds) {
        const [task] = await db
          .select()
          .from(schema.taskTable)
          .where(eq(schema.taskTable.id, taskId));
        expect(task).toBeDefined();
        expect(await storedTaskInitiative(taskId)).toHaveLength(0);
        const taskRes = await app.request(
          `/api/intelia/task/${taskId}/initiative`,
          { headers: { "x-api-key": roleKey } },
        );
        expect(taskRes.status).toBe(404);
        const changes = await taskInitiativeChanges(taskId);
        expect(changes).toHaveLength(2);
        // previousInitiativeId goes null with the initiative (ON DELETE SET NULL).
        expect(changes[1]).toMatchObject({
          previousInitiativeId: null,
          previousOrigin: "plan",
          initiativeId: null,
          origin: null,
          changedByUserId: roleAccount.user.id,
          changedByActor: DECLARED,
          source: "api_key",
        });
        expect(changes[1]?.changedAt.getTime()).toBeGreaterThan(
          changes[0]?.changedAt.getTime() ?? 0,
        );
      }
    });

    it("answers 409 INITIATIVE_NOT_EMPTY with the count of tasks not cancelled, changing nothing", async () => {
      const { app, project } = await setup();
      const { initiative, taskIds } = await initiativeWithTasks(
        app,
        project.id,
        "Iniciativa con trabajo",
        ["to-do", "done", "cancelled"],
      );
      const before = await snapshot(initiative.id, taskIds);

      const res = await deleteInitiative(app, initiative.id, {});
      expect(res.status).toBe(409);
      const body = await readErrorBody(res);
      expect(body).toMatchObject({ code: "INITIATIVE_NOT_EMPTY" });
      expect(body.message).toContain("2 tasks not cancelled");
      expect(await snapshot(initiative.id, taskIds)).toEqual(before);

      const { initiative: doneOnly, taskIds: doneIds } =
        await initiativeWithTasks(app, project.id, "Iniciativa terminada", [
          "done",
        ]);
      const doneBefore = await snapshot(doneOnly.id, doneIds);
      const doneRes = await deleteInitiative(app, doneOnly.id);
      expect(doneRes.status).toBe(409);
      const doneBody = await readErrorBody(doneRes);
      expect(doneBody).toMatchObject({ code: "INITIATIVE_NOT_EMPTY" });
      expect(doneBody.message).toContain("1 task not cancelled");
      expect(await snapshot(doneOnly.id, doneIds)).toEqual(doneBefore);
    });

    it("checks the statuses under the tasks' locks: a task leaving Cancelled meanwhile makes it 409", async () => {
      const { app, project } = await setup();
      const { initiative, taskIds } = await initiativeWithTasks(
        app,
        project.id,
        "Iniciativa en carrera",
        ["cancelled"],
      );
      const [taskId] = taskIds as [string];

      const commit = await holdTransaction((tx) =>
        tx
          .update(schema.taskTable)
          .set({ status: "to-do" })
          .where(eq(schema.taskTable.id, taskId)),
      );
      const pending = deleteInitiative(app, initiative.id);
      await waitForLockWait();
      await commit();

      const res = await pending;
      expect(res.status).toBe(409);
      expect(await readErrorBody(res)).toMatchObject({
        code: "INITIATIVE_NOT_EMPTY",
      });
      expect(await storedInitiative(initiative.id)).toHaveLength(1);
      expect(await storedTaskInitiative(taskId)).toHaveLength(1);
    });

    it("answers 404 for an unknown initiative, 401 without credentials, 403 to a viewer and 400 to a session with actor, deleting nothing", async () => {
      const { app, project, workspace, user } = await setup();
      const viewer = await keyAccount(workspace.id, "viewer", "viewer");
      const { initiative } = await initiativeWithTasks(
        app,
        project.id,
        "Iniciativa protegida",
        [],
      );

      const unknown = await deleteInitiative(app, "non-existent-initiative");
      expect(unknown.status).toBe(404);
      expect(await readErrorBody(unknown)).toMatchObject({
        message: "Initiative not found",
      });

      const sessionActor = await deleteInitiative(app, initiative.id, {
        actor: DECLARED,
      });
      expect(sessionActor.status).toBe(400);
      expect(await readErrorBody(sessionActor)).toMatchObject({
        code: "VALIDATION_ERROR",
        issues: [expect.objectContaining({ path: "body.actor" })],
      });

      vi.restoreAllMocks();
      mockAnonymousSession();
      expect((await deleteInitiative(app, initiative.id)).status).toBe(401);
      expect(
        (
          await deleteInitiative(app, initiative.id, undefined, {
            "x-api-key": viewer.key,
          })
        ).status,
      ).toBe(403);

      expect(await storedInitiative(initiative.id)).toHaveLength(1);
      vi.restoreAllMocks();
      mockAuthenticatedSession(user);
      expect((await deleteInitiative(app, initiative.id)).status).toBe(200);
    });
  });
});
