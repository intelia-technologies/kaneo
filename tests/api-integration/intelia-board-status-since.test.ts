// The board returns statusSince for each task (KF-9): the same date as the
// initiative view and the status age (apps/api/src/intelia/status-since.ts),
// computed in the board's own statement, never one query per task.
import { Client } from "pg";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { taskArchiveTable } from "../../apps/api/src/intelia/schema";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];
type BoardTask = { id: string; statusSince: string };
type Board = {
  data: {
    columns: Array<{ tasks: BoardTask[] }>;
    archivedTasks: BoardTask[];
    plannedTasks: BoardTask[];
  };
};

const DAY = 24 * 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms);

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
  mockAuthenticatedSession(user);
  return { app: createApp().app, project };
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

function seedActivity(taskId: string, type: string, createdAt: Date) {
  return db.insert(schema.activityTable).values({
    taskId,
    type,
    eventData: {},
    createdAt,
  });
}

async function board(app: App, projectId: string, query = "") {
  const response = await app.request(
    `/api/task/tasks/${projectId}?limit=100${query}`,
  );
  expect(response.status).toBe(200);
  const { data } = (await response.json()) as Board;
  const since = (tasks: BoardTask[]) =>
    Object.fromEntries(tasks.map((t) => [t.id, t.statusSince]));
  return {
    columns: since(data.columns.flatMap((c) => c.tasks)),
    archived: since(data.archivedTasks),
    planned: since(data.plannedTasks),
  };
}

describe("GET /api/task/tasks/{projectId} statusSince", () => {
  it("dates column, planned and archived tasks by their last status change, or their creation", async () => {
    const { app, project } = await setup();
    const created = ago(10 * DAY);

    // Never changed: its creation. Other activity does not count.
    const untouched = await seedTask(project.id, { createdAt: created });
    await seedActivity(untouched.id, "comment", ago(1 * DAY));

    // The last status change, not the first.
    const moved = await seedTask(project.id, {
      status: "in-progress",
      createdAt: created,
    });
    await seedActivity(moved.id, "status_changed", ago(8 * DAY));
    const movedAt = ago(3 * DAY);
    await seedActivity(moved.id, "status_changed", movedAt);

    const planned = await seedTask(project.id, {
      status: "planned",
      columnId: null,
      createdAt: created,
    });
    const plannedAt = ago(6 * DAY);
    await seedActivity(planned.id, "status_changed", plannedAt);

    const archived = await seedTask(project.id, {
      status: "done",
      createdAt: created,
    });
    const doneAt = ago(5 * DAY);
    await seedActivity(archived.id, "status_changed", doneAt);
    await db
      .insert(taskArchiveTable)
      .values({ taskId: archived.id, archivedAt: ago(1 * DAY) });

    const all = await board(app, project.id, "&archived=include");
    expect(all.columns).toEqual({
      [untouched.id]: created.toISOString(),
      [moved.id]: movedAt.toISOString(),
    });
    expect(all.planned).toEqual({ [planned.id]: plannedAt.toISOString() });
    expect(all.archived).toEqual({ [archived.id]: doneAt.toISOString() });

    expect((await board(app, project.id, "&archived=only")).archived).toEqual({
      [archived.id]: doneAt.toISOString(),
    });
  });

  it("issues the same statements for one task as for many", async () => {
    const { app, project } = await setup();
    await seedTask(project.id);
    const query = vi.spyOn(Client.prototype, "query");
    await board(app, project.id);
    const forOne = query.mock.calls.length;
    expect(forOne).toBeGreaterThan(0);

    for (let i = 0; i < 5; i++) {
      const task = await seedTask(project.id);
      await seedActivity(task.id, "status_changed", ago(i * DAY));
    }
    query.mockClear();
    const many = await board(app, project.id);
    expect(Object.keys(many.columns)).toHaveLength(6);
    expect(query.mock.calls.length).toBe(forOne);
  });
});
