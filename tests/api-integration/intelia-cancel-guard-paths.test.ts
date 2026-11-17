// The guard on every old path that cancels or deletes a task (design 82,
// CD-03, decisions 17 and 18): status change, `PUT /task/{id}`, bulk status,
// reorder, delete (also in bulk) and the rejection of a request. With
// INTELIA_CANCEL_GUARD on, a task with open dependents gets the 409 of /cancel
// and nothing changes; a batch that holds its whole chain goes through. Off,
// every path behaves as before.
import { eq, inArray } from "drizzle-orm";
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
  taskAutomationTable,
  taskRequestTable,
} from "../../apps/api/src/intelia/schema";
import {
  readFixture,
  schemaErrors,
} from "../../apps/api/src/intelia/task-cancel/fixtures/read-fixture";
import { mockAuthenticatedSession } from "./helpers/auth";
import {
  type ChainSample,
  type Seeded,
  seedSample,
  seedWorkspace,
} from "./helpers/cancel-chain";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";

type App = ReturnType<typeof createApp>["app"];
type Body = Record<string, unknown> & { details?: Record<string, unknown> };

beforeEach(async () => {
  await resetTestDatabase();
  vi.stubEnv("INTELIA_CANCEL_GUARD", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function setup() {
  const { user: owner, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Jaime",
  });
  mockAuthenticatedSession(owner);
  const seeded = await seedWorkspace(workspace.id, owner.id);
  return { app: createApp().app, owner, workspace, seeded };
}

/** A «Cancelled» column on every board seeded so far (the default has none). */
async function cancelledColumns(seeded: Seeded) {
  for (const projectId of seeded.projects.values())
    await db.insert(schema.columnTable).values({
      projectId,
      name: "Cancelled",
      slug: "cancelled",
      position: 10,
      isFinal: true,
    });
}

async function send(app: App, method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Body };
}

/** Every path that cancels one task, as a client calls it. */
const cancelPaths: Record<
  string,
  (app: App, seeded: Seeded, ticket: string) => ReturnType<typeof send>
> = {
  "PUT /task/status/{id}": (app, seeded, ticket) =>
    send(app, "PUT", `/api/task/status/${seeded.ids.get(ticket)}`, {
      status: "cancelled",
    }),
  "PUT /task/{id}": async (app, seeded, ticket) => {
    const task = await seeded.task(ticket);
    return send(app, "PUT", `/api/task/${task.id}`, {
      title: task.title,
      priority: task.priority,
      status: "cancelled",
      projectId: task.projectId,
      position: task.position ?? 0,
    });
  },
  "PATCH /task/bulk updateStatus": (app, seeded, ticket) =>
    send(app, "PATCH", "/api/task/bulk", {
      taskIds: [seeded.ids.get(ticket)],
      operation: "updateStatus",
      value: "cancelled",
    }),
  "POST /task/reorder": async (app, seeded, ticket) => {
    const task = await seeded.task(ticket);
    return send(app, "POST", "/api/task/reorder", {
      projectId: task.projectId,
      tasks: [{ id: task.id, position: 0, status: "cancelled" }],
    });
  },
};

const deletePaths: Record<
  string,
  (app: App, seeded: Seeded, ticket: string) => ReturnType<typeof send>
> = {
  "DELETE /task/{id}": (app, seeded, ticket) =>
    send(app, "DELETE", `/api/task/${seeded.ids.get(ticket)}`),
  "PATCH /task/bulk delete": (app, seeded, ticket) =>
    send(app, "PATCH", "/api/task/bulk", {
      taskIds: [seeded.ids.get(ticket)],
      operation: "delete",
    }),
};

const REASON = "Ya no hace falta: se cubre en otra petición";

async function requested(seeded: Seeded, ticket: string, requesterId: string) {
  await db
    .update(schema.taskTable)
    .set({ status: "pedida" })
    .where(eq(schema.taskTable.id, seeded.ids.get(ticket)!));
  await db.insert(taskRequestTable).values({
    taskId: seeded.ids.get(ticket)!,
    requesterUserId: requesterId,
  });
}

const reject = (app: App, seeded: Seeded, ticket: string, body: Body) =>
  send(app, "POST", `/api/intelia/task/${seeded.ids.get(ticket)}/reject`, body);

async function snapshot() {
  return {
    tasks: await db
      .select({
        id: schema.taskTable.id,
        status: schema.taskTable.status,
        column: schema.taskTable.columnId,
      })
      .from(schema.taskTable)
      .orderBy(schema.taskTable.id),
    relations: await db
      .select()
      .from(schema.taskRelationTable)
      .orderBy(schema.taskRelationTable.id),
    automation: await db
      .select()
      .from(taskAutomationTable)
      .orderBy(taskAutomationTable.taskId),
    requests: await db.select().from(taskRequestTable),
    comments: await db
      .select({ id: schema.activityTable.id })
      .from(schema.activityTable)
      .where(eq(schema.activityTable.type, "comment")),
  };
}

async function statusOf(seeded: Seeded, ...tickets: string[]) {
  const rows = await db
    .select({ id: schema.taskTable.id, status: schema.taskTable.status })
    .from(schema.taskTable)
    .where(
      inArray(
        schema.taskTable.id,
        tickets.map((t) => seeded.ids.get(t)!),
      ),
    );
  const byId = new Map(rows.map((r) => [r.id, r.status]));
  return tickets.map((t) => byId.get(seeded.ids.get(t)!) ?? null);
}

const sample = readFixture<ChainSample>("error-sf-2491");
const expected409 = sample.valor as unknown as Body & {
  details: Record<string, unknown>;
};

describe("guard on: a task with open dependents", () => {
  for (const [name, call] of Object.entries(cancelPaths))
    it(`${name} answers the 409 of the SF-2491 sample and changes nothing`, async () => {
      const { app, seeded } = await setup();
      await seedSample(seeded, sample);
      await cancelledColumns(seeded);
      const before = await snapshot();

      const res = await call(app, seeded, "SF-2491");

      expect(res.status).toBe(409);
      expect(res.body).toEqual(expected409);
      expect(schemaErrors("error_dependencias", res.body)).toBeNull();
      expect(await snapshot()).toEqual(before);
    });

  for (const [name, call] of Object.entries(deletePaths))
    it(`${name} answers the same 409, asking to cancel first, and the relations stay`, async () => {
      const { app, seeded } = await setup();
      await seedSample(seeded, sample);
      const before = await snapshot();

      const res = await call(app, seeded, "SF-2491");

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        ...expected409,
        message: expect.stringContaining("Cancélala antes"),
      });
      expect(schemaErrors("error_dependencias", res.body)).toBeNull();
      expect(await snapshot()).toEqual(before);
    });

  it("a rejected request answers the same 409, with the reason as its motivo", async () => {
    const { app, seeded, workspace } = await setup();
    await seedSample(seeded, sample);
    const requester = await addWorkspaceMember(workspace.id);
    await requested(seeded, "SF-2491", requester.id);
    const before = await snapshot();

    const res = await reject(app, seeded, "SF-2491", { reason: REASON });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      ...expected409,
      details: {
        ...expected409.details,
        motivo: { requerido: true, recibido: true },
      },
    });
    expect(schemaErrors("error_dependencias", res.body)).toBeNull();
    expect(await snapshot()).toEqual(before);
  });

  // A closed root (cancelled before the guard, or done) keeps its relations
  // too: deleting it would drop them silently.
  for (const estado of ["cancelled", "done"])
    for (const [name, call] of Object.entries(deletePaths))
      it(`${name} of a ${estado} task with an open dependent answers 409, and the relation stays`, async () => {
        const { app, seeded } = await setup();
        await cancelledColumns(seeded);
        await seeded.add("SF-1", { estado });
        await seeded.add("SF-2");
        await seeded.relate("SF-1", "SF-2");
        const before = await snapshot();

        const res = await call(app, seeded, "SF-1");

        expect(res.status).toBe(409);
        expect(schemaErrors("error_dependencias", res.body)).toBeNull();
        expect(res.body.details).toMatchObject({
          tarea: { ticket: "SF-1" },
          pendientes: ["SF-2"],
        });
        expect(res.body.message).toContain("está cerrada");
        expect(await snapshot()).toEqual(before);
      });
});

describe("guard on: without open dependents, as before", () => {
  for (const [name, call] of Object.entries(cancelPaths))
    it(`${name} cancels`, async () => {
      const { app, seeded } = await setup();
      await seeded.add("SF-1");
      await seeded.add("SF-2", { estado: "done" });
      await seeded.add("SF-3", { estado: "cancelled" });
      await seeded.relate("SF-1", "SF-2");
      await seeded.relate("SF-1", "SF-3");
      await cancelledColumns(seeded);

      const res = await call(app, seeded, "SF-1");

      expect(res.status).toBe(200);
      expect(await statusOf(seeded, "SF-1")).toEqual(["cancelled"]);
    });

  for (const [name, call] of Object.entries(deletePaths))
    it(`${name} deletes`, async () => {
      const { app, seeded } = await setup();
      await seeded.add("SF-1");
      await seeded.add("SF-2", { estado: "done" });
      await seeded.relate("SF-1", "SF-2");

      const res = await call(app, seeded, "SF-1");

      expect(res.status).toBe(200);
      expect(await statusOf(seeded, "SF-1")).toEqual([null]);
    });

  it("a rejected request without dependents is cancelled, without a comment", async () => {
    const { app, seeded, workspace } = await setup();
    await seeded.add("SF-1");
    await cancelledColumns(seeded);
    const requester = await addWorkspaceMember(workspace.id);
    await requested(seeded, "SF-1", requester.id);

    const res = await reject(app, seeded, "SF-1", { reason: "No" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ closedReason: "No" });
    expect(await statusOf(seeded, "SF-1")).toEqual(["cancelled"]);
    expect((await snapshot()).comments).toEqual([]);
  });
});

describe("guard on: batches (decision 18)", () => {
  // SF-1 → SF-2 → SF-3, and SF-1 → KF-1 on another board.
  async function chain() {
    const ctx = await setup();
    for (const t of ["SF-1", "SF-2", "SF-3", "SF-4", "KF-1"])
      await ctx.seeded.add(t);
    await ctx.seeded.relate("SF-1", "SF-2");
    await ctx.seeded.relate("SF-2", "SF-3");
    await ctx.seeded.relate("SF-1", "KF-1");
    await cancelledColumns(ctx.seeded);
    return ctx;
  }
  const ids = (seeded: Seeded, ...tickets: string[]) =>
    tickets.map((t) => seeded.ids.get(t)!);

  it("a bulk status change holding the whole chain cancels it", async () => {
    const { app, seeded } = await chain();

    const res = await send(app, "PATCH", "/api/task/bulk", {
      taskIds: ids(seeded, "SF-1", "SF-2", "SF-3", "KF-1"),
      operation: "updateStatus",
      value: "cancelled",
    });

    expect(res.status).toBe(200);
    expect(await statusOf(seeded, "SF-1", "SF-2", "SF-3", "KF-1")).toEqual([
      "cancelled",
      "cancelled",
      "cancelled",
      "cancelled",
    ]);
  });

  it("a bulk status change whose chain leaves the batch is a 409 for the whole batch", async () => {
    const { app, seeded } = await chain();
    const before = await snapshot();

    const res = await send(app, "PATCH", "/api/task/bulk", {
      taskIds: ids(seeded, "SF-1", "SF-2", "SF-4"),
      operation: "updateStatus",
      value: "cancelled",
    });

    expect(res.status).toBe(409);
    expect(schemaErrors("error_dependencias", res.body)).toBeNull();
    // The first task whose chain leaves; SF-2, in the batch, counts as cancelled.
    expect(res.body.details).toMatchObject({
      tarea: { ticket: "SF-1" },
      pendientes: ["SF-3"],
    });
    expect(res.body.message).toContain("SF-2");
    expect(await snapshot()).toEqual(before);
  });

  it("another board's dependent outside the batch is a 409 too: it needs /cancel and a motivo", async () => {
    const { app, seeded } = await chain();
    const before = await snapshot();

    const res = await send(app, "PATCH", "/api/task/bulk", {
      taskIds: ids(seeded, "SF-1", "SF-2", "SF-3"),
      operation: "updateStatus",
      value: "cancelled",
    });

    expect(res.status).toBe(409);
    expect(res.body.details).toMatchObject({
      tarea: { ticket: "SF-1" },
      pendientes: [],
    });
    expect(await snapshot()).toEqual(before);
  });

  it("a drag of several cards to Cancelled is a batch too", async () => {
    const { app, seeded } = await chain();
    await db
      .delete(schema.taskRelationTable)
      .where(
        eq(schema.taskRelationTable.targetTaskId, seeded.ids.get("KF-1")!),
      );
    const projectId = seeded.projects.get("SF")!;
    const drag = (...tickets: string[]) =>
      send(app, "POST", "/api/task/reorder", {
        projectId,
        tasks: ids(seeded, ...tickets).map((id, position) => ({
          id,
          position,
          status: "cancelled",
        })),
      });
    const before = await snapshot();

    const partial = await drag("SF-1", "SF-2");
    expect(partial.status).toBe(409);
    expect(partial.body.details).toMatchObject({ pendientes: ["SF-3"] });
    expect(await snapshot()).toEqual(before);

    const whole = await drag("SF-1", "SF-2", "SF-3");
    expect(whole.status).toBe(200);
    expect(await statusOf(seeded, "SF-1", "SF-2", "SF-3")).toEqual([
      "cancelled",
      "cancelled",
      "cancelled",
    ]);
  });

  it("a bulk delete holding the whole chain deletes it; one whose chain leaves keeps everything", async () => {
    const { app, seeded } = await chain();
    const before = await snapshot();

    const partial = await send(app, "PATCH", "/api/task/bulk", {
      taskIds: ids(seeded, "SF-1", "SF-2"),
      operation: "delete",
    });
    expect(partial.status).toBe(409);
    expect(partial.body.message).toContain("Cancélala antes");
    expect(await snapshot()).toEqual(before);

    const whole = await send(app, "PATCH", "/api/task/bulk", {
      taskIds: ids(seeded, "SF-1", "SF-2", "SF-3", "KF-1"),
      operation: "delete",
    });
    expect(whole.status).toBe(200);
    expect(await statusOf(seeded, "SF-1", "SF-2", "SF-3", "KF-1")).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("guard on: rejecting a request with resoluciones", () => {
  // SF-1, requested, with SF-2 on its board and KF-1 on another.
  async function request() {
    const ctx = await setup();
    await ctx.seeded.add("SF-1");
    await ctx.seeded.add("SF-2");
    await ctx.seeded.add("KF-1", {
      automatica: true,
      responsable: "agent:forja",
    });
    await ctx.seeded.relate("SF-1", "SF-2");
    await ctx.seeded.relate("SF-1", "KF-1");
    const requester = await addWorkspaceMember(ctx.workspace.id);
    await requested(ctx.seeded, "SF-1", requester.id);
    return ctx;
  }

  it("applies them as /cancel does, and closes the request with the reason", async () => {
    const { app, seeded } = await request();

    const res = await reject(app, seeded, "SF-1", {
      reason: REASON,
      resoluciones: [{ tarea: "SF-2", accion: "quitar" }],
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ closedReason: REASON });
    expect(await statusOf(seeded, "SF-1", "SF-2", "KF-1")).toEqual([
      "cancelled",
      "to-do",
      "to-do",
    ]);
    const after = await snapshot();
    expect(after.relations).toEqual([]);
    expect(
      after.automation.find((a) => a.taskId === seeded.ids.get("KF-1")),
    ).toMatchObject({ automatica: false });
    // The root, the released one and the other board's one.
    expect(after.comments).toHaveLength(3);
  });

  it("answers 409 with incomplete resoluciones, and nothing changes", async () => {
    const { app, seeded } = await request();
    const before = await snapshot();

    const res = await reject(app, seeded, "SF-1", {
      reason: REASON,
      resoluciones: [{ tarea: "SF-2", accion: "elige: cancelar | quitar" }],
    });

    expect(res.status).toBe(409);
    expect(res.body.details).toMatchObject({
      problemas: [{ tarea: "SF-2", problema: "accion_desconocida" }],
    });
    expect(await snapshot()).toEqual(before);
  });

  it("handles a dependent of another board alone on its own", async () => {
    const { app, seeded } = await request();
    await db
      .delete(schema.taskRelationTable)
      .where(
        eq(schema.taskRelationTable.targetTaskId, seeded.ids.get("SF-2")!),
      );

    const res = await reject(app, seeded, "SF-1", { reason: REASON });

    expect(res.status).toBe(200);
    expect((await snapshot()).relations).toEqual([]);
  });

  it("a reason too short to be a motivo is a 409 asking for one", async () => {
    const { app, seeded } = await request();

    const res = await reject(app, seeded, "SF-1", {
      reason: "No",
      resoluciones: [{ tarea: "SF-2", accion: "quitar" }],
    });

    expect(res.status).toBe(409);
    expect(res.body.details).toMatchObject({
      motivo: { requerido: true, recibido: false },
    });
  });

  it("keeps the request's own errors first: a task out of «Pedida»", async () => {
    const { app, seeded } = await request();
    await db
      .update(schema.taskTable)
      .set({ status: "to-do" })
      .where(eq(schema.taskTable.id, seeded.ids.get("SF-1")!));

    const res = await reject(app, seeded, "SF-1", { reason: REASON });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "TASK_NOT_PENDING_REQUEST" });
  });
});

describe("guard off: every path as before", () => {
  beforeEach(() => {
    vi.stubEnv("INTELIA_CANCEL_GUARD", "");
  });

  for (const [name, call] of Object.entries(cancelPaths))
    it(`${name} cancels with dependents, and their relations stay`, async () => {
      const { app, seeded } = await setup();
      await seedSample(seeded, sample);
      await cancelledColumns(seeded);
      const { relations } = await snapshot();

      const res = await call(app, seeded, "SF-2491");

      expect(res.status).toBe(200);
      expect(await statusOf(seeded, "SF-2491")).toEqual(["cancelled"]);
      expect((await snapshot()).relations).toEqual(relations);
    });

  for (const [name, call] of Object.entries(deletePaths))
    it(`${name} deletes with dependents, and the relations go with it`, async () => {
      const { app, seeded } = await setup();
      await seedSample(seeded, sample);

      const res = await call(app, seeded, "SF-2491");

      expect(res.status).toBe(200);
      const left = await db
        .select()
        .from(schema.taskRelationTable)
        .where(
          eq(schema.taskRelationTable.sourceTaskId, seeded.ids.get("SF-2491")!),
        );
      expect(left).toEqual([]);
    });

  it("a rejected request with dependents is cancelled as before", async () => {
    const { app, seeded, workspace } = await setup();
    await seedSample(seeded, sample);
    const requester = await addWorkspaceMember(workspace.id);
    await requested(seeded, "SF-2491", requester.id);
    const { relations } = await snapshot();

    const res = await reject(app, seeded, "SF-2491", { reason: REASON });

    expect(res.status).toBe(200);
    expect(await statusOf(seeded, "SF-2491")).toEqual(["cancelled"]);
    expect((await snapshot()).relations).toEqual(relations);
  });
});
