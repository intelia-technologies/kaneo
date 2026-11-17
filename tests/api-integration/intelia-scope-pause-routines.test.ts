// Routines in a paused scope (design 81 §4.1, PZ-03): the tick is consumed as
// `saltada_pausa`, the task is not reopened, `intelia.routine_skipped` is not
// sent, and svc-rutinas comments once per routine and pause.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { runDueRoutines } from "../../apps/api/src/intelia/routines/scheduler";
import { ROUTINE_SERVICE_ID } from "../../apps/api/src/intelia/routines/service-account";
import {
  initiativeTable,
  routineRunTable,
  routineTable,
  taskInitiativeTable,
} from "../../apps/api/src/intelia/schema";
import { madridToday } from "../../apps/api/src/intelia/scope-pause/revisar-el";
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

type App = ReturnType<typeof createApp>["app"];

// A real receiver, to prove `intelia.routine_skipped` is not sent.
let server: Server;
let webhookUrl: string;
let events: string[] = [];
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
      events.push((JSON.parse(raw) as { event: string }).event);
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
  events = [];
});

// Webhooks leave after the tick without being awaited: a short real window
// is the only way to show none was sent.
async function quietWindow() {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 300);
  await promise;
}

function tomorrow() {
  const date = new Date(`${madridToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function setup(status: "done" | "in-progress") {
  const { user, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Jaime",
  });
  const { project, columns } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "PRUEBAS",
  });
  const { project: home } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Software Factory",
  });
  await db.insert(schema.integrationTable).values({
    projectId: project.id,
    type: "generic-webhook",
    isActive: true,
    config: JSON.stringify({ webhookUrl, secret: "s" }),
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
  const app = createApp().app;
  mockAuthenticatedSession(user);
  return { app, user, project, home, task: task! };
}

async function schedule(app: App, taskId: string) {
  const res = await app.request(`/api/intelia/task/${taskId}/routine`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cron: "* * * * *" }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { id: string; nextRunAt: string };
}

async function pause(app: App, path: string, motivo: string) {
  const res = await app.request(`/api/intelia${path}/pause`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ motivo, revisarEl: tomorrow() }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

async function nextRunAt(routineId: string) {
  const [routine] = await db
    .select({ nextRunAt: routineTable.nextRunAt })
    .from(routineTable)
    .where(eq(routineTable.id, routineId));
  return routine!.nextRunAt;
}

async function taskStatus(taskId: string) {
  const [task] = await db
    .select({ status: schema.taskTable.status })
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, taskId));
  return task?.status;
}

function serviceComments(taskId: string) {
  return db
    .select({ content: schema.activityTable.content })
    .from(schema.activityTable)
    .where(
      and(
        eq(schema.activityTable.taskId, taskId),
        eq(schema.activityTable.type, "comment"),
        eq(schema.activityTable.userId, ROUTINE_SERVICE_ID),
      ),
    );
}

function runsOf(routineId: string) {
  return db
    .select()
    .from(routineRunTable)
    .where(eq(routineRunTable.routineId, routineId))
    .orderBy(routineRunTable.scheduledAt);
}

// Three consecutive ticks, each one minute after the previous next_run_at.
async function tickThreeTimes(routineId: string) {
  for (let i = 0; i < 3; i++) {
    const due = await nextRunAt(routineId);
    expect(await runDueRoutines(new Date(due.getTime() + 1_000))).toEqual({
      degraded: false,
    });
    expect((await nextRunAt(routineId)).getTime()).toBeGreaterThan(
      due.getTime(),
    );
  }
}

describe("API integration: routines in a paused scope", () => {
  it("skips a closed task of a paused project three times: no reopen, no routine_skipped, one comment", async () => {
    const { app, project, task } = await setup("done");
    const routine = await schedule(app, task.id);
    const paused = await pause(app, `/project/${project.id}`, "Ensayo D81");

    await tickThreeTimes(routine.id);

    expect(await taskStatus(task.id)).toBe("done");
    const runs = await runsOf(routine.id);
    expect(runs).toHaveLength(3);
    for (const run of runs) {
      expect(run).toMatchObject({
        result: "saltada_pausa",
        scopePauseId: paused.id,
        error: null,
      });
    }
    const [stored] = await db
      .select({ lastResult: routineTable.lastResult })
      .from(routineTable)
      .where(eq(routineTable.id, routine.id));
    expect(stored?.lastResult).toBe("saltada_pausa");

    expect(await serviceComments(task.id)).toEqual([
      {
        content:
          "Rutina saltada: en pausa por el proyecto «PRUEBAS» (Ensayo D81)",
      },
    ]);
    await quietWindow();
    expect(events).not.toContain("intelia.routine_skipped");
    expect(events).not.toContain("task.status_changed");

    // The runs read through the API carry the pause.
    const listed = await app.request(
      `/api/intelia/task/${task.id}/routine/runs`,
    );
    expect(await listed.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          result: "saltada_pausa",
          scopePauseId: paused.id,
        }),
      ]),
    );
  });

  it("skips an open task of a paused initiative of another project as saltada_pausa, not saltada_abierta", async () => {
    const { app, home, task } = await setup("in-progress");
    const [initiative] = await db
      .insert(initiativeTable)
      .values({
        projectId: home.id,
        name: "Pausa D81",
        nameKey: "pausa d81",
        source: "session",
      })
      .returning();
    await db.insert(taskInitiativeTable).values({
      taskId: task.id,
      initiativeId: initiative!.id,
      origin: "plan",
      source: "session",
    });
    const routine = await schedule(app, task.id);
    const paused = await pause(
      app,
      `/initiative/${initiative!.id}`,
      "Revisión de alcance",
    );

    await runDueRoutines(
      new Date(new Date(routine.nextRunAt).getTime() + 1_000),
    );

    expect(await runsOf(routine.id)).toMatchObject([
      { result: "saltada_pausa", scopePauseId: paused.id },
    ]);
    // The initiative lives in another project: the comment, readable by
    // anyone who reads the task, names neither the initiative nor its reason.
    const comments = await serviceComments(task.id);
    expect(comments).toEqual([
      {
        content: "Rutina saltada: en pausa por su iniciativa, de otro proyecto",
      },
    ]);
    expect(JSON.stringify(comments)).not.toMatch(/Pausa D81|Revisión/);
    await quietWindow();
    expect(events).not.toContain("intelia.routine_skipped");
  });

  it("goes back to the usual behavior once the pause is resumed, and comments again for a new pause", async () => {
    const { app, project, task } = await setup("done");
    const routine = await schedule(app, task.id);
    const first = await pause(app, `/project/${project.id}`, "Primera pausa");
    await runDueRoutines(
      new Date(new Date(routine.nextRunAt).getTime() + 1_000),
    );

    const resumed = await app.request(
      `/api/intelia/scope-pause/${first.id}/resume`,
      { method: "POST" },
    );
    expect(resumed.status).toBe(200);
    let due = await nextRunAt(routine.id);
    await runDueRoutines(new Date(due.getTime() + 1_000));
    expect(await taskStatus(task.id)).toBe("in-progress");

    // Open again and paused again: a new pause, a new comment.
    await pause(app, `/project/${project.id}`, "Segunda pausa");
    due = await nextRunAt(routine.id);
    await runDueRoutines(new Date(due.getTime() + 1_000));

    expect((await runsOf(routine.id)).map((run) => run.result)).toEqual([
      "saltada_pausa",
      "reabierta",
      "saltada_pausa",
    ]);
    expect(
      (await serviceComments(task.id)).map((comment) => comment.content),
    ).toEqual([
      "Rutina saltada: en pausa por el proyecto «PRUEBAS» (Primera pausa)",
      "Rutina saltada: en pausa por el proyecto «PRUEBAS» (Segunda pausa)",
    ]);
  });

  it("ignores pauses of other projects and initiatives", async () => {
    const { app, home, task } = await setup("done");
    const routine = await schedule(app, task.id);
    await pause(app, `/project/${home.id}`, "Otro tablero");

    await runDueRoutines(
      new Date(new Date(routine.nextRunAt).getTime() + 1_000),
    );

    expect(await taskStatus(task.id)).toBe("in-progress");
    expect(await runsOf(routine.id)).toMatchObject([
      { result: "reabierta", scopePauseId: null },
    ]);
    expect(await serviceComments(task.id)).toEqual([]);
  });
});
