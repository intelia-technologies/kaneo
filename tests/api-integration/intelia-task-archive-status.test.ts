// Upstream's `archived` status becomes the archive mark (design 53 §3.2,
// KF-8): every route that would write it archives a closed task with the mark
// and keeps its status, or refuses an open one with 409 TASK_NOT_CLOSED. No
// route leaves a task in the `archived` status.
import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import * as events from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import {
  initiativeTable,
  taskArchiveTable,
} from "../../apps/api/src/intelia/schema";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

let nextNumber = 1;

beforeEach(async () => {
  await resetTestDatabase();
  nextNumber = 1;
  vi.restoreAllMocks();
});

async function setup() {
  const { user, workspace } = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Software Factory",
    slug: "SF",
  });
  await db.insert(schema.columnTable).values({
    projectId: project.id,
    name: "Cancelled",
    slug: "cancelled",
    position: 10,
    isFinal: true,
  });
  const [initiative] = await db
    .insert(initiativeTable)
    .values({
      projectId: project.id,
      name: "Archivado",
      nameKey: "archivado",
      source: "session",
    })
    .returning();
  mockAuthenticatedSession(user);
  return { app: createApp().app, user, project, initiative: initiative! };
}

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
      status: "to-do",
      number,
      position: number,
      ...fields,
    })
    .returning();
  return task!;
}

function send(app: App, method: string, path: string, body: unknown) {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const setStatus = (app: App, taskId: string, status: string) =>
  send(app, "PUT", `/api/task/status/${taskId}`, { status });

async function stored(taskIds: string[]) {
  const rows = await db
    .select({
      id: schema.taskTable.id,
      status: schema.taskTable.status,
      columnId: schema.taskTable.columnId,
    })
    .from(schema.taskTable)
    .where(inArray(schema.taskTable.id, taskIds));
  return new Map(rows.map((row) => [row.id, row]));
}

async function marked(taskIds: string[]) {
  const rows = await db
    .select({ taskId: taskArchiveTable.taskId })
    .from(taskArchiveTable)
    .where(inArray(taskArchiveTable.taskId, taskIds));
  return rows.map((row) => row.taskId).sort();
}

describe("PUT /api/task/status/{id} with archived", () => {
  it("archives a done task with the mark, keeps it done, and its dependent can still start", async () => {
    const { app, project } = await setup();
    const blocker = await seedTask(project.id, { status: "done" });
    const dependent = await seedTask(project.id);
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: blocker.id,
      targetTaskId: dependent.id,
      relationType: "blocks",
    });
    const publish = vi.spyOn(events, "publishEvent");

    const response = await setStatus(app, blocker.id, "archived");
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("done");
    expect((await stored([blocker.id])).get(blocker.id)?.status).toBe("done");
    expect(await marked([blocker.id])).toEqual([blocker.id]);
    // Boards refetch once; no status change is announced.
    expect(publish).toHaveBeenCalledWith("intelia.tasks_archived", {
      projectId: project.id,
    });
    expect(publish).not.toHaveBeenCalledWith(
      "task.status_changed",
      expect.anything(),
    );

    expect((await setStatus(app, dependent.id, "in-progress")).status).toBe(
      200,
    );
  });

  it("archives a cancelled task with the mark and keeps it cancelled", async () => {
    const { app, project } = await setup();
    const cancelled = await seedTask(project.id, { status: "cancelled" });

    expect((await setStatus(app, cancelled.id, "archived")).status).toBe(200);
    expect((await stored([cancelled.id])).get(cancelled.id)?.status).toBe(
      "cancelled",
    );
    expect(await marked([cancelled.id])).toEqual([cancelled.id]);
  });

  it("refuses an open task with 409 TASK_NOT_CLOSED and changes nothing", async () => {
    const { app, project } = await setup();
    const open = await seedTask(project.id, { status: "in-progress" });

    const response = await setStatus(app, open.id, "archived");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "TASK_NOT_CLOSED" });
    expect((await stored([open.id])).get(open.id)?.status).toBe("in-progress");
    expect(await marked([open.id])).toEqual([]);
  });

  it("leaves a task already in the old status as it is", async () => {
    const { app, project } = await setup();
    const legacy = await seedTask(project.id, { status: "archived" });

    expect((await setStatus(app, legacy.id, "archived")).status).toBe(200);
    expect((await stored([legacy.id])).get(legacy.id)?.status).toBe("archived");
    expect(await marked([legacy.id])).toEqual([]);
  });
});

describe("other routes that would write archived", () => {
  it("PUT /api/task/{id}: archives a closed task and saves the other fields; refuses an open one", async () => {
    const { app, project } = await setup();
    const done = await seedTask(project.id, { status: "done" });
    const open = await seedTask(project.id);
    const legacy = await seedTask(project.id, { status: "archived" });
    const put = (task: typeof done, title: string) =>
      send(app, "PUT", `/api/task/${task.id}`, {
        title,
        description: "",
        priority: "low",
        status: "archived",
        projectId: project.id,
        position: task.position ?? 0,
      });

    const saved = await put(done, "Renombrada");
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({
      title: "Renombrada",
      status: "done",
    });
    expect(await marked([done.id])).toEqual([done.id]);

    const refused = await put(open, "No cambia");
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "TASK_NOT_CLOSED" });
    expect((await stored([open.id])).get(open.id)?.status).toBe("to-do");

    // A task left in the old status can still be edited.
    expect((await put(legacy, "Antigua")).status).toBe(200);
    expect(await marked([open.id, legacy.id])).toEqual([]);
  });

  it("PATCH /api/task/bulk: archives closed tasks with the mark, or refuses the whole batch", async () => {
    const { app, project } = await setup();
    const done = await seedTask(project.id, { status: "done" });
    const cancelled = await seedTask(project.id, { status: "cancelled" });
    const open = await seedTask(project.id);
    const bulk = (taskIds: string[]) =>
      send(app, "PATCH", "/api/task/bulk", {
        taskIds,
        operation: "updateStatus",
        value: "archived",
      });

    const refused = await bulk([done.id, open.id]);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "TASK_NOT_CLOSED" });
    expect(await marked([done.id, open.id])).toEqual([]);

    expect((await bulk([done.id, cancelled.id])).status).toBe(200);
    const rows = await stored([done.id, cancelled.id]);
    expect(rows.get(done.id)?.status).toBe("done");
    expect(rows.get(cancelled.id)?.status).toBe("cancelled");
    expect(await marked([done.id, cancelled.id])).toEqual(
      [done.id, cancelled.id].sort(),
    );
  });

  it("POST /api/task/reorder: a card moved to archived keeps its status and gets the mark", async () => {
    const { app, project } = await setup();
    const done = await seedTask(project.id, { status: "done" });
    const open = await seedTask(project.id);
    const reorder = (id: string) =>
      send(app, "POST", "/api/task/reorder", {
        projectId: project.id,
        tasks: [{ id, position: 1, status: "archived" }],
      });

    const response = await reorder(done.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { id: done.id, position: 1, status: "done" },
    ]);
    expect(await marked([done.id])).toEqual([done.id]);

    const refused = await reorder(open.id);
    expect(refused.status).toBe(409);
    expect((await stored([open.id])).get(open.id)?.status).toBe("to-do");
  });

  it("POST /api/task/{projectId}: refuses to create a task in archived", async () => {
    const { app, project, initiative } = await setup();
    const response = await send(app, "POST", `/api/task/${project.id}`, {
      title: "Nueva",
      description: "",
      priority: "medium",
      status: "archived",
      type: "diseno",
      automation: { level: "manual", verification: false },
      initiative: { id: initiative.id },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "TASK_NOT_CLOSED" });
  });

  it("POST /api/task/duplicate/{id}: a copy of a task in the old status goes to the backlog", async () => {
    const { app, project, initiative } = await setup();
    const legacy = await seedTask(project.id, { status: "archived" });
    // seedTask numbers tasks by hand; the copy claims the project's next one.
    await db
      .update(schema.projectTable)
      .set({ lastTaskNumber: nextNumber })
      .where(eq(schema.projectTable.id, project.id));
    const response = await send(
      app,
      "POST",
      `/api/task/duplicate/${legacy.id}`,
      {
        automation: { level: "manual", verification: false },
        initiativeId: initiative.id,
      },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("planned");
  });

  it("POST /api/task/import/{projectId}: archived tasks come in done with the mark", async () => {
    const { app, project, initiative } = await setup();
    const response = await send(app, "POST", `/api/task/import/${project.id}`, {
      tasks: [
        { title: "Vieja", status: "archived" },
        { title: "Abierta", status: "to-do" },
      ],
      automation: { level: "manual", verification: false },
      initiativeId: initiative.id,
    });
    expect(response.status).toBe(200);
    const { results } = await response.json();
    expect(results.successful).toBe(2);
    const [old, open] = results.tasks.map(
      (row: { task: { id: string; status: string } }) => row.task,
    );
    expect(old.status).toBe("done");
    expect(open.status).toBe("to-do");
    expect(await marked([old.id, open.id])).toEqual([old.id]);
    const doneColumn = await db.query.columnTable.findFirst({
      where: and(
        eq(schema.columnTable.projectId, project.id),
        eq(schema.columnTable.slug, "done"),
      ),
    });
    expect((await stored([old.id])).get(old.id)?.columnId).toBe(doneColumn?.id);
  });
});

it("no route leaves a task in the archived status", async () => {
  const { app, project } = await setup();
  const done = await seedTask(project.id, { status: "done" });
  const cancelled = await seedTask(project.id, { status: "cancelled" });
  const open = await seedTask(project.id);
  await setStatus(app, done.id, "archived");
  await setStatus(app, open.id, "archived");
  await send(app, "PATCH", "/api/task/bulk", {
    taskIds: [cancelled.id, open.id],
    operation: "updateStatus",
    value: "archived",
  });
  await send(app, "POST", "/api/task/reorder", {
    projectId: project.id,
    tasks: [{ id: cancelled.id, position: 2, status: "archived" }],
  });
  expect(
    await db
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(
        and(
          eq(schema.taskTable.projectId, project.id),
          eq(schema.taskTable.status, "archived"),
        ),
      ),
  ).toEqual([]);
});
