// Archiving tasks (design 53 §3.2, KF-4): a mark apart from the status. An
// archived task stays done or cancelled for dependencies, initiatives and the
// critical path; the board leaves it out unless asked.
import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import {
  initiativeTable,
  taskArchiveTable,
  taskInitiativeTable,
} from "../../apps/api/src/intelia/schema";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";

type App = ReturnType<typeof createApp>["app"];
type BoardTask = {
  id: string;
  status: string;
  archivedAt: string | null;
  blockersSummary: { pendingCount: number };
};
type Board = {
  data: {
    columns: Array<{ slug: string; tasks: BoardTask[] }>;
    archivedTasks: BoardTask[];
  };
  pagination: { total: number };
};

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
  return {
    app: createApp().app,
    user,
    workspace,
    project,
    initiative: initiative!,
  };
}

async function seedTask(
  projectId: string,
  fields: Partial<typeof schema.taskTable.$inferInsert> & {
    initiativeId?: string;
  } = {},
) {
  const { initiativeId, ...overrides } = fields;
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
      ...overrides,
    })
    .returning();
  if (initiativeId) {
    await db.insert(taskInitiativeTable).values({
      taskId: task!.id,
      initiativeId,
      origin: "plan",
      source: "session",
    });
  }
  return task!;
}

function blocks(sourceTaskId: string, targetTaskId: string) {
  return db
    .insert(schema.taskRelationTable)
    .values({ sourceTaskId, targetTaskId, relationType: "blocks" });
}

function post(app: App, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const archive = (app: App, taskIds: string[]) =>
  post(app, "/api/intelia/tasks/archive", { taskIds });
const unarchive = (app: App, taskIds: string[]) =>
  post(app, "/api/intelia/tasks/unarchive", { taskIds });

async function board(app: App, projectId: string, query = "") {
  const response = await app.request(
    `/api/task/tasks/${projectId}?limit=100${query}`,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as Board;
  const inColumns = body.data.columns.flatMap((c) => c.tasks.map((t) => t.id));
  const archived = body.data.archivedTasks.map((t) => t.id);
  return { body, inColumns, archived };
}

function setStatus(app: App, taskId: string, status: string) {
  return app.request(`/api/task/status/${taskId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

async function marks(taskIds: string[]) {
  return db
    .select()
    .from(taskArchiveTable)
    .where(inArray(taskArchiveTable.taskId, taskIds));
}

describe("POST /api/intelia/tasks/archive", () => {
  it("keeps the status: the task detail still returns it done or cancelled, with archivedAt", async () => {
    const { app, project } = await setup();
    const done = await seedTask(project.id, { status: "done" });
    const cancelled = await seedTask(project.id, { status: "cancelled" });

    const response = await archive(app, [done.id, cancelled.id]);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.archivedCount).toBe(2);
    expect(body.tasks.map((t: { taskId: string }) => t.taskId).sort()).toEqual(
      [done.id, cancelled.id].sort(),
    );

    for (const [task, status] of [
      [done, "done"],
      [cancelled, "cancelled"],
    ] as const) {
      const detail = await app.request(`/api/task/${task.id}`);
      expect(detail.status).toBe(200);
      const json = await detail.json();
      expect(json.status).toBe(status);
      expect(json.archivedAt).toEqual(expect.any(String));
      const [row] = await db
        .select({ status: schema.taskTable.status })
        .from(schema.taskTable)
        .where(eq(schema.taskTable.id, task.id));
      expect(row?.status).toBe(status);
    }
  });

  it("leaves archived tasks off the board by default and returns them when asked", async () => {
    const { app, project } = await setup();
    const open = await seedTask(project.id);
    const done = await seedTask(project.id, { status: "done" });
    const kept = await seedTask(project.id, { status: "done" });
    // Archived with upstream's old button, before the mark existed.
    const legacy = await seedTask(project.id, { status: "archived" });
    expect((await archive(app, [done.id])).status).toBe(200);

    const plain = await board(app, project.id);
    expect(plain.inColumns.sort()).toEqual([open.id, kept.id].sort());
    // Upstream's old status keeps upstream's behavior: only the mark is left out.
    expect(plain.archived).toEqual([legacy.id]);
    expect(plain.body.pagination.total).toBe(3);

    const included = await board(app, project.id, "&archived=include");
    expect(included.inColumns.sort()).toEqual([open.id, kept.id].sort());
    expect(included.archived.sort()).toEqual([done.id, legacy.id].sort());
    const marked = included.body.data.archivedTasks.find(
      (t) => t.id === done.id,
    );
    expect(marked).toMatchObject({ status: "done" });
    expect(marked?.archivedAt).toEqual(expect.any(String));
    expect(
      included.body.data.archivedTasks.find((t) => t.id === legacy.id)
        ?.archivedAt,
    ).toBeNull();

    const only = await board(app, project.id, "&archived=only");
    expect(only.inColumns).toEqual([]);
    expect(only.archived.sort()).toEqual([done.id, legacy.id].sort());
    expect(only.body.pagination.total).toBe(2);

    const invalid = await app.request(
      `/api/task/tasks/${project.id}?archived=all`,
    );
    expect(invalid.status).toBe(400);
  });

  it("still satisfies dependencies: an archived done blocker lets its dependent start, an archived cancelled one does not", async () => {
    const { app, project } = await setup();
    const doneBlocker = await seedTask(project.id, { status: "done" });
    const cancelledBlocker = await seedTask(project.id, {
      status: "cancelled",
    });
    const freed = await seedTask(project.id);
    const held = await seedTask(project.id);
    await blocks(doneBlocker.id, freed.id);
    await blocks(cancelledBlocker.id, held.id);
    expect(
      (await archive(app, [doneBlocker.id, cancelledBlocker.id])).status,
    ).toBe(200);

    const { body } = await board(app, project.id);
    const pending = new Map(
      body.data.columns
        .flatMap((c) => c.tasks)
        .map((t) => [t.id, t.blockersSummary.pendingCount]),
    );
    expect(pending.get(freed.id)).toBe(0);
    expect(pending.get(held.id)).toBe(1);

    expect((await setStatus(app, freed.id, "in-progress")).status).toBe(200);
    const refused = await setStatus(app, held.id, "in-progress");
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "PENDING_BLOCKERS" });
  });

  it("still counts in its initiative and on the critical path", async () => {
    const { app, project, initiative } = await setup();
    const own = (fields: Partial<typeof schema.taskTable.$inferInsert> = {}) =>
      seedTask(project.id, { initiativeId: initiative.id, ...fields });
    const done = await own({ status: "done" });
    const cancelled = await own({ status: "cancelled" });
    const next = await own();
    const last = await own();
    await blocks(done.id, next.id);
    await blocks(next.id, last.id);

    const read = async () => {
      const list = await app.request(
        `/api/intelia/project/${project.id}/initiatives`,
      );
      expect(list.status).toBe(200);
      const { initiatives } = await list.json();
      const detail = await app.request(
        `/api/intelia/initiative/${initiative.id}`,
      );
      const plan = await app.request(
        `/api/intelia/initiative/${initiative.id}/plan`,
      );
      expect(plan.status).toBe(200);
      const planBody = await plan.json();
      return {
        state: initiatives[0].state,
        counters: initiatives[0].counters,
        pendingChain: (await detail.json()).pendingChain,
        criticalPath: {
          taskIds: planBody.criticalPath.taskIds,
          hours: planBody.criticalPath.hours,
        },
        tasks: planBody.tasks.map(
          (t: { id: string; remainingHours: number; critical: boolean }) => ({
            id: t.id,
            remainingHours: t.remainingHours,
            critical: t.critical,
          }),
        ),
      };
    };

    const before = await read();
    expect((await archive(app, [done.id, cancelled.id])).status).toBe(200);
    const after = await read();

    expect(after).toEqual(before);
    expect(after.counters).toMatchObject({
      total: 4,
      done: 1,
      cancelled: 1,
    });
    expect(after.criticalPath.taskIds).toEqual([next.id, last.id]);
    expect(after.tasks.map((t: { id: string }) => t.id)).toContain(done.id);
  });

  it("is idempotent: archiving twice changes nothing", async () => {
    const { app, project } = await setup();
    const done = await seedTask(project.id, { status: "done" });
    const first = await (await archive(app, [done.id])).json();
    const rows = await marks([done.id]);

    const again = await archive(app, [done.id, done.id]);
    expect(again.status).toBe(200);
    const second = await again.json();
    expect(second.archivedCount).toBe(0);
    expect(second.tasks).toEqual(first.tasks);
    expect(await marks([done.id])).toEqual(rows);
  });

  it("archives 100 tasks in one call and refuses 101", async () => {
    const { app, project } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 101; i++) {
      ids.push((await seedTask(project.id, { status: "done" })).id);
    }

    const tooMany = await archive(app, ids);
    expect(tooMany.status).toBe(400);
    expect(await marks(ids)).toEqual([]);

    const response = await archive(app, ids.slice(0, 100));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.archivedCount).toBe(100);
    expect(body.tasks).toHaveLength(100);
    expect(await marks(ids)).toHaveLength(100);
    expect((await board(app, project.id)).inColumns).toEqual([ids[100]]);
  });

  it("refuses the whole batch if a task is open or unknown, and an empty one", async () => {
    const { app, project } = await setup();
    const done = await seedTask(project.id, { status: "done" });
    const open = await seedTask(project.id, { status: "in-progress" });
    const legacy = await seedTask(project.id, { status: "archived" });

    const refused = await archive(app, [done.id, open.id]);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "TASK_NOT_CLOSED" });
    expect((await archive(app, [legacy.id])).status).toBe(409);
    expect((await archive(app, [done.id, "no-such-task"])).status).toBe(404);
    expect((await archive(app, [])).status).toBe(400);
    expect(await marks([done.id, open.id, legacy.id])).toEqual([]);
  });

  it("requires task:update in the tasks' workspace", async () => {
    const { project, workspace } = await setup();
    const done = await seedTask(project.id, { status: "done" });
    const viewer = await addWorkspaceMember(workspace.id, "viewer");
    vi.restoreAllMocks();
    mockAuthenticatedSession(viewer);
    expect((await archive(createApp().app, [done.id])).status).toBe(403);

    const stranger = await createWorkspaceMember({ role: "owner" });
    vi.restoreAllMocks();
    mockAuthenticatedSession(stranger.user);
    expect([403, 404]).toContain(
      (await archive(createApp().app, [done.id])).status,
    );
    expect(await marks([done.id])).toEqual([]);
  });
});

describe("leaving the archive", () => {
  it("unarchives: the task is back on the board with its status", async () => {
    const { app, project } = await setup();
    const done = await seedTask(project.id, { status: "done" });
    const never = await seedTask(project.id, { status: "done" });
    await archive(app, [done.id]);

    const response = await unarchive(app, [done.id, never.id]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      unarchivedCount: 1,
      taskIds: [done.id],
    });
    expect((await board(app, project.id)).inColumns.sort()).toEqual(
      [done.id, never.id].sort(),
    );
  });

  it("drops the mark when the task leaves its final column", async () => {
    const { app, project } = await setup();
    const done = await seedTask(project.id, { status: "done" });
    const stays = await seedTask(project.id, { status: "done" });
    await archive(app, [done.id, stays.id]);

    expect((await setStatus(app, done.id, "to-do")).status).toBe(200);
    // Moving between final columns keeps it archived.
    expect((await setStatus(app, stays.id, "cancelled")).status).toBe(200);
    await vi.waitFor(async () => {
      expect((await marks([done.id])).length).toBe(0);
    });
    expect(await marks([stays.id])).toHaveLength(1);
    expect((await board(app, project.id)).inColumns).toEqual([done.id]);
  });

  it("counts the mark only on a closed task, even if the reopen's event never ran", async () => {
    const { app, project } = await setup();
    const open = await seedTask(project.id, { status: "in-progress" });
    // A mark left behind, as if the process stopped before the reopen's event.
    await db.insert(taskArchiveTable).values({ taskId: open.id });

    expect((await board(app, project.id)).inColumns).toEqual([open.id]);
    expect((await board(app, project.id, "&archived=only")).archived).toEqual(
      [],
    );
    const detail = await (await app.request(`/api/task/${open.id}`)).json();
    expect(detail.archivedAt).toBeNull();
  });
});

describe("search", () => {
  it("still finds archived tasks, with archivedAt", async () => {
    const { app, project, workspace } = await setup();
    const done = await seedTask(project.id, {
      status: "done",
      title: "Informe archivable",
    });
    await archive(app, [done.id]);

    for (const q of ["archivable", `SF-${done.number}`]) {
      const response = await app.request(
        `/api/search?q=${encodeURIComponent(q)}&type=tasks&workspaceId=${workspace.id}`,
      );
      expect(response.status).toBe(200);
      const { results } = await response.json();
      expect(results).toContainEqual(
        expect.objectContaining({
          id: done.id,
          status: "done",
          archivedAt: expect.any(String),
        }),
      );
    }
  });
});
