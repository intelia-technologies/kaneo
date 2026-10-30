import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import {
  routineRunTable,
  routineTable,
} from "../../apps/api/src/intelia/schema";
import { runDueRoutines } from "../../apps/api/src/intelia/routines/scheduler";
import {
  ROUTINE_SERVICE_EMAIL,
  ensureRoutineServiceAccount,
} from "../../apps/api/src/intelia/routines/service-account";
import { genericWebhookPlugin } from "../../apps/api/src/plugins/generic-webhook";
import {
  initializeEventSubscriptions,
  registerPlugin,
} from "../../apps/api/src/plugins/registry";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

const SECRET = "routine-webhook-secret";

type App = {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>;
};

type Delivery = {
  body: {
    event: string;
    task: { id: string; status: string };
    actor: { id: string | null; name: string | null };
    data: Record<string, unknown>;
  };
  signatureValid: boolean;
};

// A real receiver: the deliveries go through upstream's generic webhook
// client, signature included.
let server: Server;
let webhookUrl: string;
let deliveries: Delivery[] = [];
const previousAllowPrivate =
  process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;

beforeAll(async () => {
  process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = "true";
  registerPlugin(genericWebhookPlugin);
  initializeEventSubscriptions();
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const expected = createHmac("sha256", SECRET).update(raw).digest("hex");
      deliveries.push({
        body: JSON.parse(raw),
        signatureValid: req.headers["x-kaneo-signature"] === expected,
      });
      res.writeHead(200).end("ok");
    });
  });
  const listening = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", listening.resolve);
  await listening.promise;
  webhookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/kaneo`;
});

afterAll(async () => {
  process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = previousAllowPrivate;
  const closed = Promise.withResolvers<void>();
  server.close(() => closed.resolve());
  await closed.promise;
});

beforeEach(async () => {
  await resetTestDatabase();
  deliveries = [];
});

async function setup({ status = "done" }: { status?: string } = {}) {
  const { user, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Jaime",
  });
  const { project, columns } = await createProjectFixture({
    workspaceId: workspace.id,
  });
  await db.insert(schema.integrationTable).values({
    projectId: project.id,
    type: "generic-webhook",
    isActive: true,
    config: JSON.stringify({ webhookUrl, secret: SECRET }),
  });
  const column = status === "done" ? columns.done : columns.inProgress;
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId: project.id,
      title: "Repasar el backlog",
      number: 1,
      status,
      columnId: column.id,
      userId: user.id,
    })
    .returning();
  const { app } = createApp();
  mockAuthenticatedSession(user);
  return { user, workspace, project, task: task!, app };
}

async function putRoutine(
  app: App,
  taskId: string,
  body: Record<string, unknown>,
) {
  return app.request(`/api/intelia/task/${taskId}/routine`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function scheduleEveryMinute(app: App, taskId: string, active = true) {
  const res = await putRoutine(app, taskId, { cron: "* * * * *", active });
  expect(res.status).toBe(200);
  return (await res.json()) as { id: string; nextRunAt: string };
}

async function taskStatus(taskId: string) {
  const [task] = await db
    .select({ status: schema.taskTable.status })
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, taskId));
  return task?.status;
}

async function runs(routineId: string) {
  return db
    .select()
    .from(routineRunTable)
    .where(eq(routineRunTable.routineId, routineId));
}

function afterNextRun(routine: { nextRunAt: string }) {
  return new Date(new Date(routine.nextRunAt).getTime() + 1_000);
}

describe("API integration: Intelia routines", () => {
  it("reopens a closed task to In progress as svc-rutinas and the webhook gets task.status_changed", async () => {
    const { task, app, user } = await setup();
    const routine = await scheduleEveryMinute(app, task.id);
    const tick = afterNextRun(routine);

    expect(await runDueRoutines(tick)).toEqual({ degraded: false });

    expect(await taskStatus(task.id)).toBe("in-progress");
    const [run] = await runs(routine.id);
    expect(run).toMatchObject({ result: "reabierta", closedAt: null });
    expect(run!.scheduledAt.toISOString()).toBe(routine.nextRunAt);

    await vi.waitFor(() =>
      expect(
        deliveries.some((d) => d.body.event === "task.status_changed"),
      ).toBe(true),
    );
    const delivery = deliveries.find(
      (d) => d.body.event === "task.status_changed",
    )!;
    expect(delivery.signatureValid).toBe(true);
    expect(delivery.body).toMatchObject({
      task: { id: task.id, status: "in-progress" },
      actor: { id: "svc-rutinas", name: "svc-rutinas" },
      data: { oldStatus: "done", newStatus: "in-progress" },
    });

    // Rescheduled from the tick, and the API shows the outcome.
    const res = await app.request(`/api/intelia/task/${task.id}/routine`);
    const after = (await res.json()) as Record<string, unknown>;
    expect(after).toMatchObject({
      lastResult: "reabierta",
      lastRunAt: tick.toISOString(),
      ownerId: user.id,
      ownerName: "Jaime",
    });
    expect(new Date(after.nextRunAt as string).getTime()).toBeGreaterThan(
      tick.getTime(),
    );
  });

  it("skips the tick while the task is open and sends a signed intelia.routine_skipped", async () => {
    const { task, app, user, project } = await setup({ status: "in-progress" });
    const routine = await scheduleEveryMinute(app, task.id);

    expect(await runDueRoutines(afterNextRun(routine))).toEqual({
      degraded: false,
    });

    expect(await taskStatus(task.id)).toBe("in-progress");
    const [run] = await runs(routine.id);
    expect(run?.result).toBe("saltada_abierta");
    const skipped = deliveries.filter(
      (d) => d.body.event === "intelia.routine_skipped",
    );
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.signatureValid).toBe(true);
    expect(skipped[0]!.body).toMatchObject({
      project: { id: project.id },
      task: { id: task.id, status: "in-progress" },
      actor: { id: "svc-rutinas", name: "svc-rutinas" },
      data: {
        routineId: routine.id,
        runId: run!.id,
        result: "saltada_abierta",
        scheduledAt: routine.nextRunAt,
        cron: "* * * * *",
        timezone: "Europe/Madrid",
        owner: { id: user.id, name: "Jaime" },
      },
    });
    expect(deliveries.some((d) => d.body.event === "task.status_changed")).toBe(
      false,
    );
  });

  it("does not send intelia.routine_skipped to webhooks that do not send task.status_changed", async () => {
    const { task, app, project } = await setup({ status: "in-progress" });
    await db
      .update(schema.integrationTable)
      .set({
        config: JSON.stringify({
          webhookUrl,
          secret: SECRET,
          events: { taskStatusChanged: false },
        }),
      })
      .where(eq(schema.integrationTable.projectId, project.id));
    const routine = await scheduleEveryMinute(app, task.id);

    await runDueRoutines(afterNextRun(routine));

    expect((await runs(routine.id))[0]?.result).toBe("saltada_abierta");
    expect(deliveries).toHaveLength(0);
  });

  it("leaves a paused routine alone", async () => {
    const { task, app } = await setup();
    const routine = await scheduleEveryMinute(app, task.id, false);

    await runDueRoutines(afterNextRun(routine));

    expect(await taskStatus(task.id)).toBe("done");
    expect(await runs(routine.id)).toHaveLength(0);
  });

  it("runs a tick once even when two instances race for it", async () => {
    const { task, app } = await setup();
    const routine = await scheduleEveryMinute(app, task.id);
    const tick = afterNextRun(routine);

    await Promise.all([runDueRoutines(tick), runDueRoutines(tick)]);

    expect(await runs(routine.id)).toHaveLength(1);
  });

  it("closes the history row when the task reaches Done", async () => {
    const { task, app } = await setup();
    const routine = await scheduleEveryMinute(app, task.id);
    await runDueRoutines(afterNextRun(routine));
    expect((await runs(routine.id))[0]?.closedAt).toBeNull();

    const res = await app.request(`/api/task/status/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    expect(res.status).toBe(200);

    await vi.waitFor(async () =>
      expect((await runs(routine.id))[0]?.closedAt).toBeInstanceOf(Date),
    );
    const history = await app.request(
      `/api/intelia/task/${task.id}/routine/runs`,
    );
    expect(history.status).toBe(200);
    const [row] = (await history.json()) as Array<Record<string, unknown>>;
    expect(row).toMatchObject({ result: "reabierta" });
    expect(typeof row!.closedAt).toBe("string");
  });

  it("deleting the task deletes its routine and history", async () => {
    const { task, app } = await setup();
    const routine = await scheduleEveryMinute(app, task.id);
    await runDueRoutines(afterNextRun(routine));

    const res = await app.request(`/api/task/${task.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    expect(
      await db
        .select()
        .from(routineTable)
        .where(eq(routineTable.id, routine.id)),
    ).toHaveLength(0);
    expect(await runs(routine.id)).toHaveLength(0);
  });

  it("rejects a task that repeats with Kaneo's recurrence, and invalid schedules", async () => {
    const { task, app } = await setup();
    await db
      .update(schema.taskTable)
      .set({
        recurrence: { frequency: "daily", interval: 1, timeZone: "UTC" },
      })
      .where(eq(schema.taskTable.id, task.id));
    expect((await putRoutine(app, task.id, { cron: "0 * * * *" })).status).toBe(
      409,
    );

    await db
      .update(schema.taskTable)
      .set({ recurrence: null })
      .where(eq(schema.taskTable.id, task.id));
    for (const body of [
      { cron: "not a cron" },
      { cron: "*/10 * * * * *" },
      { cron: "0 * * * *", timezone: "Mars/Olympus" },
    ]) {
      expect((await putRoutine(app, task.id, body)).status).toBe(400);
    }
    expect(await db.select().from(routineTable)).toHaveLength(0);
  });

  it("changes, pauses and removes a routine, and lists it for the workspace", async () => {
    const { task, app, workspace, project, user } = await setup();
    await scheduleEveryMinute(app, task.id);

    const changed = await putRoutine(app, task.id, {
      cron: "0 */2 * * *",
      timezone: "UTC",
      active: false,
    });
    expect(changed.status).toBe(200);
    const routine = (await changed.json()) as Record<string, unknown>;
    expect(routine).toMatchObject({
      cron: "0 */2 * * *",
      timezone: "UTC",
      active: false,
    });
    expect(new Date(routine.nextRunAt as string).getUTCMinutes()).toBe(0);
    expect(await db.select().from(routineTable)).toHaveLength(1);

    const list = await app.request(
      `/api/intelia/workspace/${workspace.id}/routines`,
    );
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject([
      {
        id: routine.id,
        active: false,
        task: {
          id: task.id,
          title: "Repasar el backlog",
          projectId: project.id,
          assigneeId: user.id,
          assigneeName: "Jaime",
        },
      },
    ]);

    const removed = await app.request(`/api/intelia/task/${task.id}/routine`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(200);
    expect(
      (await app.request(`/api/intelia/task/${task.id}/routine`)).status,
    ).toBe(404);
  });

  it("hides the task from users of another workspace", async () => {
    const { task, workspace } = await setup();
    const outsider = await createWorkspaceMember({ userName: "Outsider" });
    const { app } = createApp();
    mockAuthenticatedSession(outsider.user);

    expect((await putRoutine(app, task.id, { cron: "0 * * * *" })).status).toBe(
      404,
    );
    expect(
      (await app.request(`/api/intelia/workspace/${workspace.id}/routines`))
        .status,
    ).toBe(404);
    expect(await db.select().from(routineTable)).toHaveLength(0);
  });

  it("ensures a banned, credential-less svc-rutinas account", async () => {
    const id = await ensureRoutineServiceAccount();
    expect(await ensureRoutineServiceAccount()).toBe(id);

    const [user] = await db
      .select()
      .from(schema.userTable)
      .where(eq(schema.userTable.email, ROUTINE_SERVICE_EMAIL));
    expect(user).toMatchObject({ id, name: "svc-rutinas", banned: true });
    expect(
      await db
        .select()
        .from(schema.accountTable)
        .where(eq(schema.accountTable.userId, id)),
    ).toHaveLength(0);
  });
});
