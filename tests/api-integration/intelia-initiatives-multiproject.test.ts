// Initiatives with tasks of several projects (design 52 §3.1, IM-01): a task
// of another project joins an initiative and counts in its progress and plan;
// a reader of only the initiative's project sees it anonymized.
import { eq } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import {
  initiativeTable,
  taskInitiativeTable,
} from "../../apps/api/src/intelia/schema";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
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
  vi.stubEnv("INTELIA_TASK_INITIATIVE_OPTIONAL", "");
  vi.stubEnv("INTELIA_TASK_AUTOMATION_OPTIONAL", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function seedTask(
  projectId: string,
  fields: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  const number = nextNumber++;
  await db
    .update(schema.projectTable)
    .set({ lastTaskNumber: number })
    .where(eq(schema.projectTable.id, projectId));
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
      ...fields,
    })
    .returning();
  if (!task) throw new Error("Failed to seed task");
  return task;
}

async function seedInitiative(projectId: string, name: string) {
  const [initiative] = await db
    .insert(initiativeTable)
    .values({ projectId, name, nameKey: name.toLowerCase(), source: "session" })
    .returning();
  if (!initiative) throw new Error("Failed to seed initiative");
  return initiative;
}

function putTaskInitiative(app: App, taskId: string, initiativeId: string) {
  return app.request(`/api/intelia/task/${taskId}/initiative`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initiativeId }),
  });
}

function createTask(app: App, projectId: string, initiativeId: string) {
  return app.request(`/api/task/${projectId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Tarea nueva",
      description: "",
      priority: "medium",
      status: "to-do",
      type: "diseno",
      initiative: { id: initiativeId },
    }),
  });
}

async function getJson(app: App, path: string) {
  const response = await app.request(`/api/intelia${path}`);
  return { status: response.status, body: await response.json() };
}

function membershipOf(taskId: string) {
  return db
    .select()
    .from(taskInitiativeTable)
    .where(eq(taskInitiativeTable.taskId, taskId));
}

// SF holds the initiative; INFRA holds a task of it. The owner reads both;
// `reader` only SF.
async function setup() {
  const { user, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Jaime",
  });
  const { project: home } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Software Factory",
    slug: "SF",
  });
  const { project: infra } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Infraestructura",
    slug: "INFRA",
  });
  const initiative = await seedInitiative(home.id, "Trabajo entre tableros");
  const reader = await addWorkspaceMember(workspace.id, "member");
  await restrictToProjects(workspace.id, reader.id, [home.id]);
  mockAuthenticatedSession(user);
  return {
    app: createApp().app,
    user,
    workspace,
    home,
    infra,
    initiative,
    reader,
  };
}

describe("an initiative with a task of another project", () => {
  it("takes the task and counts it in its listing, detail and plan", async () => {
    const { app, home, infra, initiative } = await setup();
    const own = await seedTask(home.id, { status: "done" });
    await putTaskInitiative(app, own.id, initiative.id);
    const other = await seedTask(infra.id, { title: "Abrir puerto" });

    const res = await putTaskInitiative(app, other.id, initiative.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      initiativeId: initiative.id,
      initiativeName: "Trabajo entre tableros",
      initiativeReadable: true,
      origin: "plan",
    });

    const list = await getJson(app, `/project/${home.id}/initiatives`);
    expect(list.body.initiatives[0]).toMatchObject({
      state: "in_flight",
      counters: {
        total: 2,
        active: 2,
        done: 1,
        hidden: { total: 0, active: 0, done: 0 },
      },
    });

    const detail = await getJson(app, `/initiative/${initiative.id}`);
    expect(
      detail.body.tasks.map((t: { id: string; projectSlug: string }) => [
        t.id,
        t.projectSlug,
      ]),
    ).toEqual([
      [own.id, "SF"],
      [other.id, "INFRA"],
    ]);

    const plan = await getJson(app, `/initiative/${initiative.id}/plan`);
    expect(plan.status).toBe(200);
    expect(plan.body.criticalPath.partial).toBe(false);
    expect(
      plan.body.tasks.find((t: { id: string }) => t.id === other.id),
    ).toMatchObject({ projectId: infra.id, external: false });
  });

  it("creates a task of one project straight into an initiative of another", async () => {
    const { app, infra, initiative } = await setup();
    const res = await createTask(app, infra.id, initiative.id);
    expect(res.status).toBe(200);
    const task = (await res.json()) as { id: string };
    expect(await membershipOf(task.id)).toEqual([
      expect.objectContaining({ initiativeId: initiative.id, origin: "plan" }),
    ]);
  });

  it("shows it anonymized to a reader of only the initiative's project", async () => {
    const { app, home, infra, initiative, reader } = await setup();
    const own = await seedTask(home.id, { title: "Tarea visible" });
    await putTaskInitiative(app, own.id, initiative.id);
    const secret = await seedTask(infra.id, {
      title: "Tarea secreta",
      status: "done",
    });
    const pending = await seedTask(infra.id, {
      title: "Otra secreta",
      status: "blocked",
    });
    await putTaskInitiative(app, secret.id, initiative.id);
    await putTaskInitiative(app, pending.id, initiative.id);
    mockAuthenticatedSession(reader);

    const list = await getJson(app, `/project/${home.id}/initiatives`);
    expect(list.status).toBe(200);
    expect(list.body.initiatives[0]).toMatchObject({
      counters: {
        total: 3,
        active: 3,
        done: 1,
        blocked: 1,
        hidden: { total: 2, active: 2, done: 1 },
      },
      blockedTasks: [],
    });

    const detail = await getJson(app, `/initiative/${initiative.id}`);
    expect(detail.body.tasks.map((t: { id: string }) => t.id)).toEqual([
      own.id,
    ]);
    expect(detail.body.counters.hidden).toEqual({
      total: 2,
      active: 2,
      done: 1,
    });

    const plan = await getJson(app, `/initiative/${initiative.id}/plan`);
    expect(plan.body.tasks.map((t: { id: string }) => t.id)).toEqual([own.id]);
    // A pending task it cannot see may be on the real critical path.
    expect(plan.body.criticalPath.partial).toBe(true);

    for (const raw of [list.body, detail.body, plan.body].map((body) =>
      JSON.stringify(body),
    )) {
      for (const leaked of [
        secret.id,
        pending.id,
        "Tarea secreta",
        "Otra secreta",
        "INFRA",
        infra.id,
      ]) {
        expect(raw).not.toContain(leaked);
      }
    }
  });

  it("hides the name of an initiative of a project the reader cannot see", async () => {
    const { app, workspace, home, infra, reader } = await setup();
    const infraInitiative = await seedInitiative(infra.id, "Red privada");
    const task = await seedTask(home.id);
    await putTaskInitiative(app, task.id, infraInitiative.id);
    mockAuthenticatedSession(reader);

    const single = await getJson(app, `/task/${task.id}/initiative`);
    expect(single.status).toBe(200);
    expect(single.body).toMatchObject({
      initiativeId: infraInitiative.id,
      initiativeName: null,
      initiativeReadable: false,
    });

    const response = await app.request(
      `/api/intelia/workspace/${workspace.id}/task-initiatives`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskIds: [task.id] }),
      },
    );
    expect(await response.json()).toEqual({
      tasks: [
        {
          taskId: task.id,
          initiativeId: infraInitiative.id,
          initiativeName: null,
        },
      ],
    });
    expect(JSON.stringify(single.body)).not.toContain("Red privada");
  });
});

describe("who may put a task in an initiative of another project", () => {
  it("rejects a caller who cannot read the initiative's project, changing nothing", async () => {
    const { app, home, infra, reader } = await setup();
    const infraInitiative = await seedInitiative(infra.id, "Red privada");
    const task = await seedTask(home.id);
    mockAuthenticatedSession(reader);

    const put = await putTaskInitiative(app, task.id, infraInitiative.id);
    expect(put.status).toBe(400);
    expect(await readErrorBody(put)).toMatchObject({
      code: "INITIATIVE_NOT_FOUND",
    });
    expect(await membershipOf(task.id)).toEqual([]);

    const created = await createTask(app, home.id, infraInitiative.id);
    expect(created.status).toBe(400);
    expect(await readErrorBody(created)).toMatchObject({
      code: "INITIATIVE_NOT_FOUND",
    });
    const tasks = await db
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, home.id));
    expect(tasks).toHaveLength(1);
  });

  it("rejects an initiative of another workspace like an unknown one", async () => {
    const { app, home } = await setup();
    const stranger = await createWorkspaceMember({ userName: "Ajeno" });
    const { project: foreign } = await createProjectFixture({
      workspaceId: stranger.workspace.id,
      name: "Ajeno",
      slug: "AJ",
    });
    const foreignInitiative = await seedInitiative(foreign.id, "Ajena");
    const task = await seedTask(home.id);

    const res = await putTaskInitiative(app, task.id, foreignInitiative.id);
    expect(res.status).toBe(400);
    expect(await readErrorBody(res)).toMatchObject({
      code: "INITIATIVE_NOT_FOUND",
    });
    expect(await membershipOf(task.id)).toEqual([]);
  });
});

describe("deleting an initiative with tasks of another project", () => {
  it("unlinks every cancelled task but names only those the caller can read", async () => {
    const { app, workspace, home, infra, initiative } = await setup();
    const own = await seedTask(home.id, { status: "cancelled" });
    const other = await seedTask(infra.id, { status: "cancelled" });
    await putTaskInitiative(app, own.id, initiative.id);
    await putTaskInitiative(app, other.id, initiative.id);
    // Can write in SF but not read INFRA.
    const writer = await addWorkspaceMember(workspace.id, "member");
    await restrictToProjects(workspace.id, writer.id, [home.id]);
    mockAuthenticatedSession(writer);

    const res = await app.request(`/api/intelia/initiative/${initiative.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).unlinkedTaskIds).toEqual([own.id]);
    expect(await membershipOf(own.id)).toEqual([]);
    expect(await membershipOf(other.id)).toEqual([]);
  });
});

describe("GET /api/intelia/project/{projectId}/initiative-options", () => {
  it("lists the initiatives of every project the caller can read", async () => {
    const { app, home, infra, initiative, reader } = await setup();
    const infraInitiative = await seedInitiative(infra.id, "Red privada");

    const all = await getJson(app, `/project/${home.id}/initiative-options`);
    expect(all.status).toBe(200);
    expect(
      all.body.initiatives.map((i: { id: string; projectSlug: string }) => [
        i.id,
        i.projectSlug,
      ]),
    ).toEqual([
      [infraInitiative.id, "INFRA"],
      [initiative.id, "SF"],
    ]);

    mockAuthenticatedSession(reader);
    const own = await getJson(app, `/project/${home.id}/initiative-options`);
    expect(own.body.initiatives.map((i: { id: string }) => i.id)).toEqual([
      initiative.id,
    ]);
    const denied = await getJson(
      app,
      `/project/${infra.id}/initiative-options`,
    );
    expect(denied.status).toBe(403);
  });
});

describe("an initiative of a single project", () => {
  it("behaves as before: same counters, nothing hidden, plan not partial", async () => {
    const { app, home, initiative, reader } = await setup();
    const done = await seedTask(home.id, { status: "done" });
    const todo = await seedTask(home.id);
    await putTaskInitiative(app, done.id, initiative.id);
    await putTaskInitiative(app, todo.id, initiative.id);

    for (const who of ["owner", "reader"] as const) {
      if (who === "reader") mockAuthenticatedSession(reader);
      const detail = await getJson(app, `/initiative/${initiative.id}`);
      expect(detail.body).toMatchObject({
        state: "in_flight",
        counters: {
          total: 2,
          active: 2,
          done: 1,
          hidden: { total: 0, active: 0, done: 0 },
        },
      });
      const plan = await getJson(app, `/initiative/${initiative.id}/plan`);
      expect(plan.body.criticalPath.partial).toBe(false);
    }
  });
});
