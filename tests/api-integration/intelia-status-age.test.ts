import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
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

let nextNumber = 1;

beforeEach(async () => {
  await resetTestDatabase();
  nextNumber = 1;
  vi.restoreAllMocks();
});

const ago = (ms: number) => new Date(Date.now() - ms);

async function seedTask(
  projectId: string,
  fields: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
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
      ...fields,
    })
    .returning();
  if (!task) throw new Error("Failed to seed task");
  return task;
}

function seedChange(
  taskId: string,
  oldStatus: string,
  newStatus: string,
  createdAt: Date,
) {
  return db.insert(schema.activityTable).values({
    taskId,
    type: "status_changed",
    eventData: { oldStatus, newStatus },
    createdAt,
  });
}

// `count` tasks created 30 days ago that stayed 1 h, 2 h, … in To do and are
// now in In progress (their open stay there).
async function seedFinishedStays(projectId: string, count: number) {
  for (let hours = 1; hours <= count; hours++) {
    const createdAt = ago(30 * DAY);
    const task = await seedTask(projectId, {
      status: "in-progress",
      createdAt,
    });
    await seedChange(
      task.id,
      "to-do",
      "in-progress",
      new Date(createdAt.getTime() + hours * HOUR),
    );
  }
}

async function setup() {
  const { user, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Jaime",
  });
  const { project, columns } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Software Factory",
    slug: "SF",
  });
  mockAuthenticatedSession(user);
  return { app: createApp().app, user, workspace, project, columns };
}

async function get(app: App, path: string, headers = {}) {
  const response = await app.request(path, { headers });
  return { status: response.status, body: await response.json() };
}

const statusAge = (app: App, projectId: string, headers = {}) =>
  get(app, `/api/intelia/project/${projectId}/status-age`, headers);

describe("GET /api/intelia/project/{projectId}/status-age", () => {
  it("dates each open task by its last status change, or its creation, and leaves out Done and Cancelled", async () => {
    const { app, project } = await setup();
    const untouched = await seedTask(project.id, { createdAt: ago(5 * DAY) });
    const moved = await seedTask(project.id, {
      status: "in-review",
      createdAt: ago(9 * DAY),
    });
    const last = ago(1 * DAY);
    await seedChange(moved.id, "to-do", "in-progress", ago(8 * DAY));
    await seedChange(moved.id, "in-progress", "in-review", last);
    await seedChange(moved.id, "in-review", "in-progress", ago(3 * DAY));
    const done = await seedTask(project.id, { status: "done" });
    const cancelled = await seedTask(project.id, { status: "cancelled" });
    const otherProject = await createProjectFixture({
      workspaceId: project.workspaceId,
    });
    const foreign = await seedTask(otherProject.project.id);

    const { status, body } = await statusAge(app, project.id);

    expect(status).toBe(200);
    // The activity order, not the insertion order, decides the last change.
    expect(body.tareas).toEqual({
      [untouched.id]: untouched.createdAt.toISOString(),
      [moved.id]: last.toISOString(),
    });
    expect(body.tareas).not.toHaveProperty(done.id);
    expect(body.tareas).not.toHaveProperty(cancelled.id);
    expect(body.tareas).not.toHaveProperty(foreign.id);
    expect(new Date(body.calculado_en).toISOString()).toBe(body.calculado_en);
  });

  it("keeps the entry date when the task is reordered in its column and moves it on a real status change", async () => {
    const { app, project, columns } = await setup();
    const entered = ago(2 * DAY);
    const task = await seedTask(project.id, {
      status: "in-progress",
      columnId: columns.inProgress.id,
      createdAt: ago(4 * DAY),
    });
    await seedChange(task.id, "to-do", "in-progress", entered);

    const reorder = await app.request("/api/task/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        tasks: [{ id: task.id, position: 7, status: "in-progress" }],
      }),
    });
    expect(reorder.status).toBe(200);
    expect((await statusAge(app, project.id)).body.tareas[task.id]).toBe(
      entered.toISOString(),
    );

    const changed = await app.request(`/api/task/status/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "in-review" }),
    });
    expect(changed.status).toBe(200);
    await vi.waitFor(async () => {
      const since = (await statusAge(app, project.id)).body.tareas[task.id];
      expect(new Date(since).getTime()).toBeGreaterThan(entered.getTime());
    });
  });

  it("gives no percentiles with 9 finished stays", async () => {
    const { app, project } = await setup();
    await seedFinishedStays(project.id, 9);

    const { body } = await statusAge(app, project.id);

    expect(body.columnas).toEqual({
      "to-do": { p75_s: null, p90_s: null, casos: 9 },
    });
  });

  it("gives p75 and p90 from 10 finished stays, without open stays or exits older than 90 days", async () => {
    const { app, project } = await setup();
    await seedFinishedStays(project.id, 10);
    // Left To do 91 days ago after 1 s: would drag both percentiles down.
    const old = await seedTask(project.id, {
      status: "in-progress",
      createdAt: new Date(ago(91 * DAY).getTime() - 1000),
    });
    await seedChange(old.id, "to-do", "in-progress", ago(91 * DAY));
    // Still in To do for 100 days: would push them up.
    await seedTask(project.id, { createdAt: ago(100 * DAY) });

    const { body } = await statusAge(app, project.id);

    // percentile_cont over 1 h … 10 h: 7.75 h and 9.1 h. The 10 tasks still
    // in In progress give that column no case.
    expect(body.columnas).toEqual({
      "to-do": { p75_s: 27_900, p90_s: 32_760, casos: 10 },
    });
  });

  it("starts the first stay at the creation and the next ones at the previous change", async () => {
    const { app, project } = await setup();
    for (let i = 0; i < 10; i++) {
      const createdAt = ago(20 * DAY);
      const task = await seedTask(project.id, { status: "done", createdAt });
      const leftTodo = new Date(createdAt.getTime() + HOUR);
      await seedChange(task.id, "to-do", "in-review", leftTodo);
      await seedChange(
        task.id,
        "in-review",
        "done",
        new Date(leftTodo.getTime() + 2 * HOUR),
      );
    }

    const { body } = await statusAge(app, project.id);

    expect(body.columnas).toEqual({
      "to-do": { p75_s: 3600, p90_s: 3600, casos: 10 },
      "in-review": { p75_s: 7200, p90_s: 7200, casos: 10 },
    });
    expect(body.tareas).toEqual({});
  });

  it("keeps the percentiles of a project for 10 minutes", async () => {
    const { app, project } = await setup();
    await seedFinishedStays(project.id, 9);
    const first = (await statusAge(app, project.id)).body;
    await seedFinishedStays(project.id, 1);

    const cached = (await statusAge(app, project.id)).body;
    expect(cached.columnas).toEqual(first.columnas);
    expect(cached.calculado_en).toBe(first.calculado_en);
    // The entry dates are not cached: the new task is already there.
    expect(Object.keys(cached.tareas)).toHaveLength(10);

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 10 * 60 * 1000 + 1);
    const fresh = (await statusAge(app, project.id)).body;
    expect(fresh.columnas["to-do"].casos).toBe(10);
    expect(fresh.columnas["to-do"].p75_s).not.toBeNull();
    expect(fresh.calculado_en).not.toBe(first.calculado_en);
  });

  it("answers with the access of the task list: API key of a member, and the same error without access", async () => {
    const { app, workspace, project } = await setup();
    const task = await seedTask(project.id);
    const member = await addWorkspaceMember(workspace.id, "member");
    const { key } = await auth.api.createApiKey({
      body: { userId: member.id, name: "orquestador" },
    });

    const withKey = await statusAge(app, project.id, { "x-api-key": key });
    expect(withKey.status).toBe(200);
    expect(Object.keys(withKey.body.tareas)).toEqual([task.id]);

    const other = await createProjectFixture({ workspaceId: workspace.id });
    await restrictToProjects(workspace.id, member.id, [other.project.id]);
    mockAuthenticatedSession(member);
    const list = await get(app, `/api/task/tasks/${project.id}`);
    const denied = await statusAge(app, project.id);
    expect(list.status).toBe(403);
    expect(denied).toEqual(list);

    const unknownList = await get(app, "/api/task/tasks/unknown");
    expect(await statusAge(app, "unknown")).toEqual(unknownList);
  });
});
