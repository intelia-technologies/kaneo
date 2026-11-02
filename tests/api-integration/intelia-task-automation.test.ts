import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq, sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { subscribeToEvent } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import {
  taskAutomationChangeTable,
  taskAutomationTable,
} from "../../apps/api/src/intelia/schema";
import { genericWebhookPlugin } from "../../apps/api/src/plugins/generic-webhook";
import {
  initializeEventSubscriptions,
  registerPlugin,
} from "../../apps/api/src/plugins/registry";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

const GATEWAY_TOKEN = "gateway-service-token-with-32-chars-or-more";

// Every task.created, with whether the task's level was already committed
// when the event went out.
const createdEvents: Array<{ taskId: string; levelCommitted: boolean }> = [];
await subscribeToEvent<{ taskId: string }>("task.created", async (data) => {
  createdEvents.push({
    taskId: data.taskId,
    levelCommitted: (await stored(data.taskId)).length === 1,
  });
});

beforeEach(async () => {
  await resetTestDatabase();
  createdEvents.length = 0;
  vi.stubEnv("INTELIA_TASK_AUTOMATION_OPTIONAL", "");
  vi.stubEnv("INTELIA_GATEWAY_TOKEN", GATEWAY_TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function setup() {
  const { user, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Jaime",
  });
  const { project, columns } = await createProjectFixture({
    workspaceId: workspace.id,
  });
  // A role account: a workspace member that only holds an API key.
  const roleAccount = await createWorkspaceMember({ userName: "coder" });
  await db.insert(schema.workspaceUserTable).values({
    workspaceId: workspace.id,
    userId: roleAccount.user.id,
    role: "member",
    joinedAt: new Date(),
  });
  const { key: roleKey } = await auth.api.createApiKey({
    body: { userId: roleAccount.user.id, name: "coder" },
  });
  mockAuthenticatedSession(user);
  return { app: createApp().app, user, project, columns, roleKey, roleAccount };
}

function createTask(
  app: App,
  projectId: string,
  extra: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.request(`/api/task/${projectId}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      title: "Guardar el nivel",
      description: "",
      priority: "medium",
      status: "to-do",
      ...extra,
    }),
  });
}

function putAutomation(
  app: App,
  taskId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.request(`/api/intelia/task/${taskId}/automation`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function createdTaskId(app: App, projectId: string) {
  const res = await createTask(app, projectId, {
    automation: { level: "manual", verification: true },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: string }).id;
}

function stored(taskId: string) {
  return db
    .select()
    .from(taskAutomationTable)
    .where(eq(taskAutomationTable.taskId, taskId));
}

function changes(taskId: string) {
  return db
    .select()
    .from(taskAutomationChangeTable)
    .where(eq(taskAutomationChangeTable.taskId, taskId))
    .orderBy(taskAutomationChangeTable.changedAt);
}

async function taskCount() {
  return (await db.select().from(schema.taskTable)).length;
}

describe("API integration: Intelia task automation level", () => {
  describe("creating a task", () => {
    it("rejects a task without level and creates nothing", async () => {
      const { app, project } = await setup();

      const res = await createTask(app, project.id, {});

      expect(res.status).toBe(400);
      expect(await readErrorBody(res)).toMatchObject({
        code: "VALIDATION_ERROR",
        issues: [expect.objectContaining({ path: "body.automation" })],
      });
      expect(await taskCount()).toBe(0);
    });

    it("rejects an unknown level and `completa` without verification", async () => {
      const { app, project } = await setup();

      const unknown = await createTask(app, project.id, {
        automation: { level: "total", verification: true },
      });
      const completa = await createTask(app, project.id, {
        automation: { level: "completa", verification: false },
      });

      expect(unknown.status).toBe(400);
      expect(completa.status).toBe(400);
      expect(await readErrorBody(completa)).toMatchObject({
        issues: [
          expect.objectContaining({
            path: "body.automation.verification",
            message: "`completa` requires verification: true",
          }),
        ],
      });
      expect(await taskCount()).toBe(0);
    });

    it("with the test exception on, defaults a missing level to manual and still validates a given one", async () => {
      const { app, project } = await setup();
      vi.stubEnv("INTELIA_TASK_AUTOMATION_OPTIONAL", "true");

      const missing = await createTask(app, project.id, {});
      const invalid = await createTask(app, project.id, {
        automation: { level: "completa", verification: false },
      });

      expect(missing.status).toBe(200);
      const { id } = (await missing.json()) as { id: string };
      expect(await stored(id)).toEqual([
        expect.objectContaining({ level: "manual", verification: true }),
      ]);
      expect(invalid.status).toBe(400);
      expect(await taskCount()).toBe(1);
    });

    it("stores the level of a person's task and logs it as the first change", async () => {
      const { app, project, user } = await setup();

      const res = await createTask(app, project.id, {
        automation: { level: "arranque", verification: false },
      });

      expect(res.status).toBe(200);
      const { id } = (await res.json()) as { id: string };
      expect(await stored(id)).toEqual([
        expect.objectContaining({
          level: "arranque",
          verification: false,
          source: "session",
          setByUserId: user.id,
        }),
      ]);
      expect(await changes(id)).toEqual([
        expect.objectContaining({
          previousLevel: null,
          previousVerification: null,
          level: "arranque",
          verification: false,
          changedByUserId: user.id,
          source: "session",
        }),
      ]);
    });

    it("lets a role account's API key set the first level of the task it creates", async () => {
      const { app, project, roleKey, roleAccount } = await setup();
      mockAnonymousSession();

      const res = await createTask(
        app,
        project.id,
        { automation: { level: "completa", verification: true } },
        { "x-api-key": roleKey },
      );

      expect(res.status).toBe(200);
      const { id } = (await res.json()) as { id: string };
      expect(await stored(id)).toEqual([
        expect.objectContaining({
          level: "completa",
          source: "api_key",
          setByUserId: roleAccount.user.id,
        }),
      ]);
    });

    it.each([
      ["the level", "task_automation"],
      ["the change log", "task_automation_change"],
    ])(
      "rolls the task back when %s cannot be written, publishes nothing, and a retry creates one task",
      async (_what, table) => {
        const { app, project } = await setup();
        const body = { automation: { level: "arranque", verification: true } };
        await db.execute(
          sql.raw(`CREATE OR REPLACE FUNCTION intelia.au02_test_fail() RETURNS trigger
            LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$`),
        );
        await db.execute(
          sql.raw(`CREATE TRIGGER au02_test_fail BEFORE INSERT ON intelia.${table}
            FOR EACH ROW EXECUTE FUNCTION intelia.au02_test_fail()`),
        );
        let failed: Response;
        try {
          failed = await createTask(app, project.id, body);
        } finally {
          await db.execute(
            sql.raw(
              `DROP TRIGGER au02_test_fail ON intelia.${table}; DROP FUNCTION intelia.au02_test_fail()`,
            ),
          );
        }

        expect(failed.status).toBe(500);
        expect(await taskCount()).toBe(0);
        expect(await db.select().from(taskAutomationTable)).toEqual([]);
        expect(await db.select().from(taskAutomationChangeTable)).toEqual([]);

        const retry = await createTask(app, project.id, body);

        expect(retry.status).toBe(200);
        const { id } = (await retry.json()) as { id: string };
        expect(await taskCount()).toBe(1);
        expect(await stored(id)).toHaveLength(1);
        expect(await changes(id)).toHaveLength(1);
        // Only the retry's event, sent after its level was committed: an event
        // from the failed attempt would be listed too.
        await vi.waitFor(() =>
          expect(createdEvents).toEqual([{ taskId: id, levelCommitted: true }]),
        );
      },
    );
  });

  describe("changing the level", () => {
    it("logs every change from a person's session, and a repeated value is not a change", async () => {
      const { app, project, user } = await setup();
      const taskId = await createdTaskId(app, project.id);

      const first = await putAutomation(app, taskId, {
        level: "arranque",
        verification: true,
      });
      const second = await putAutomation(app, taskId, {
        level: "completa",
        verification: true,
      });
      const repeated = await putAutomation(app, taskId, {
        level: "completa",
        verification: true,
      });

      expect([first.status, second.status, repeated.status]).toEqual([
        200, 200, 200,
      ]);
      expect(await repeated.json()).toMatchObject({
        taskId,
        level: "completa",
        verification: true,
        source: "session",
        setByUserId: user.id,
        setByName: "Jaime",
        setByActor: null,
      });

      const history = await app.request(
        `/api/intelia/task/${taskId}/automation/history`,
      );
      expect(history.status).toBe(200);
      expect(
        ((await history.json()) as Array<Record<string, unknown>>).map(
          (change) => [
            change.previousLevel,
            change.level,
            change.changedByName,
          ],
        ),
      ).toEqual([
        ["arranque", "completa", "Jaime"],
        ["manual", "arranque", "Jaime"],
        [null, "manual", "Jaime"],
      ]);
    });

    it("rejects `completa` without verification and keeps the level", async () => {
      const { app, project } = await setup();
      const taskId = await createdTaskId(app, project.id);

      const res = await putAutomation(app, taskId, {
        level: "completa",
        verification: false,
      });

      expect(res.status).toBe(400);
      expect(await stored(taskId)).toEqual([
        expect.objectContaining({ level: "manual", verification: true }),
      ]);
    });

    it("answers 403 to a role account's API key, which can still read the level", async () => {
      const { app, project, roleKey } = await setup();
      const taskId = await createdTaskId(app, project.id);
      mockAnonymousSession();

      const write = await putAutomation(
        app,
        taskId,
        { level: "completa", verification: true },
        { "x-api-key": roleKey },
      );
      const bearer = await putAutomation(
        app,
        taskId,
        { level: "completa", verification: true },
        { authorization: `Bearer ${roleKey}` },
      );
      const read = await app.request(`/api/intelia/task/${taskId}/automation`, {
        headers: { "x-api-key": roleKey },
      });

      expect(write.status).toBe(403);
      expect(await readErrorBody(write)).toMatchObject({
        code: "AUTOMATION_WRITE_FORBIDDEN",
      });
      expect(bearer.status).toBe(403);
      expect(read.status).toBe(200);
      expect(await stored(taskId)).toEqual([
        expect.objectContaining({ level: "manual" }),
      ]);
      expect(await changes(taskId)).toHaveLength(1);
    });

    it("answers 403 to a person without task:update", async () => {
      const { app, project, user } = await setup();
      const taskId = await createdTaskId(app, project.id);
      const viewer = await createWorkspaceMember({ role: "viewer" });
      await db
        .update(schema.workspaceUserTable)
        .set({ workspaceId: project.workspaceId })
        .where(eq(schema.workspaceUserTable.userId, viewer.user.id));
      vi.restoreAllMocks();
      mockAuthenticatedSession(viewer.user);

      const res = await putAutomation(app, taskId, {
        level: "arranque",
        verification: true,
      });

      expect(res.status).toBe(403);
      expect(await stored(taskId)).toEqual([
        expect.objectContaining({ level: "manual", setByUserId: user.id }),
      ]);
    });

    it("rejects `actor` from a session", async () => {
      const { app, project } = await setup();
      const taskId = await createdTaskId(app, project.id);

      const res = await putAutomation(app, taskId, {
        level: "arranque",
        verification: true,
        actor: "agent:orq-jaime",
      });

      expect(res.status).toBe(400);
    });
  });

  describe("the gateway's service token", () => {
    it("writes for the actor it names and reads the task, its log and the project", async () => {
      const { app, project } = await setup();
      const taskId = await createdTaskId(app, project.id);
      mockAnonymousSession();
      const gateway = { "x-service-token": GATEWAY_TOKEN };

      const res = await putAutomation(
        app,
        taskId,
        { level: "arranque", verification: true, actor: "agent:orq-jaime" },
        gateway,
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        level: "arranque",
        source: "gateway",
        setByUserId: null,
        setByActor: "agent:orq-jaime",
      });
      const history = await app.request(
        `/api/intelia/task/${taskId}/automation/history`,
        { headers: gateway },
      );
      expect(await history.json()).toEqual([
        expect.objectContaining({
          previousLevel: "manual",
          level: "arranque",
          source: "gateway",
          changedByActor: "agent:orq-jaime",
        }),
        expect.objectContaining({ level: "manual", source: "session" }),
      ]);
      const read = await app.request(`/api/intelia/task/${taskId}/automation`, {
        headers: gateway,
      });
      expect(await read.json()).toMatchObject({ level: "arranque" });
      const list = await app.request(
        `/api/intelia/project/${project.id}/automation`,
        { headers: gateway },
      );
      expect(await list.json()).toEqual([
        expect.objectContaining({ taskId, level: "arranque" }),
      ]);
    });

    it("requires `actor`", async () => {
      const { app, project } = await setup();
      const taskId = await createdTaskId(app, project.id);
      mockAnonymousSession();

      const res = await putAutomation(
        app,
        taskId,
        { level: "arranque", verification: true },
        { "x-service-token": GATEWAY_TOKEN },
      );

      expect(res.status).toBe(400);
      expect(await changes(taskId)).toHaveLength(1);
    });

    it("answers 401 to a wrong token, or to any token when none is configured", async () => {
      const { app, project } = await setup();
      const taskId = await createdTaskId(app, project.id);
      mockAnonymousSession();
      const body = {
        level: "arranque",
        verification: true,
        actor: "agent:orq-jaime",
      };

      const wrong = await putAutomation(app, taskId, body, {
        "x-service-token": `${GATEWAY_TOKEN}-not`,
      });
      vi.stubEnv("INTELIA_GATEWAY_TOKEN", "");
      const unset = await putAutomation(app, taskId, body, {
        "x-service-token": "",
      });
      const unconfigured = await putAutomation(app, taskId, body, {
        "x-service-token": GATEWAY_TOKEN,
      });

      expect(wrong.status).toBe(401);
      expect(unset.status).toBe(401);
      expect(unconfigured.status).toBe(401);
      expect(await changes(taskId)).toHaveLength(1);
    });

    it("opens no other route", async () => {
      const { app, project } = await setup();
      const taskId = await createdTaskId(app, project.id);
      mockAnonymousSession();

      const res = await app.request(`/api/task/${taskId}`, {
        headers: { "x-service-token": GATEWAY_TOKEN },
      });

      expect(res.status).toBe(401);
    });

    it("answers 404 for a task that does not exist", async () => {
      const { app } = await setup();
      mockAnonymousSession();

      const res = await putAutomation(
        app,
        "missing-task",
        { level: "manual", verification: true, actor: "agent:orq-jaime" },
        { "x-service-token": GATEWAY_TOKEN },
      );

      expect(res.status).toBe(404);
    });
  });

  describe("the task.automation_changed webhook", () => {
    const SECRET = "automation-webhook-secret";
    type Delivery = {
      body: {
        event: string;
        task: { id: string };
        actor: { id: string | null; name: string | null };
        data: Record<string, unknown>;
      };
      raw: string;
      signatureValid: boolean;
    };
    // A real receiver: deliveries go through upstream's generic webhook
    // client, signature included.
    let server: Server;
    let webhookUrl: string;
    const deliveries: Delivery[] = [];
    const ofEvent = (event: string) =>
      deliveries.filter((d) => d.body.event === event);

    beforeAll(async () => {
      registerPlugin(genericWebhookPlugin);
      initializeEventSubscriptions();
      server = createServer((req, res) => {
        let raw = "";
        req.on("data", (chunk) => {
          raw += chunk;
        });
        req.on("end", () => {
          const expected = createHmac("sha256", SECRET)
            .update(raw)
            .digest("hex");
          deliveries.push({
            body: JSON.parse(raw),
            raw,
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
      const closed = Promise.withResolvers<void>();
      server.close(() => closed.resolve());
      await closed.promise;
    });

    beforeEach(() => {
      deliveries.length = 0;
      vi.stubEnv("KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS", "true");
    });

    it("goes out once per change, from a session and from the gateway, and not on creation", async () => {
      const { app, project, user } = await setup();
      await db.insert(schema.integrationTable).values({
        projectId: project.id,
        type: "generic-webhook",
        isActive: true,
        config: JSON.stringify({ webhookUrl, secret: SECRET }),
      });

      const taskId = await createdTaskId(app, project.id);
      // The webhook is live: creating the task sends task.created, not a change.
      await vi.waitFor(() => expect(ofEvent("task.created")).toHaveLength(1));

      const session = await putAutomation(app, taskId, {
        level: "arranque",
        verification: true,
      });
      expect(session.status).toBe(200);
      await vi.waitFor(() =>
        expect(ofEvent("task.automation_changed")).toHaveLength(1),
      );
      // The same value again is not a change: no event.
      const repeated = await putAutomation(app, taskId, {
        level: "arranque",
        verification: true,
      });
      expect(repeated.status).toBe(200);

      mockAnonymousSession();
      const gateway = await putAutomation(
        app,
        taskId,
        { level: "completa", verification: true, actor: "agent:orq-jaime" },
        { "x-service-token": GATEWAY_TOKEN },
      );
      expect(gateway.status).toBe(200);
      await vi.waitFor(() =>
        expect(ofEvent("task.automation_changed")).toHaveLength(2),
      );

      const [bySession, byGateway] = ofEvent("task.automation_changed");
      expect(bySession).toMatchObject({
        signatureValid: true,
        body: {
          task: { id: taskId },
          actor: { id: user.id, name: "Jaime" },
          data: {
            previousLevel: "manual",
            previousVerification: true,
            level: "arranque",
            verification: true,
            source: "session",
            changedByActor: null,
            changedAt: expect.any(String),
          },
        },
      });
      expect(byGateway).toMatchObject({
        signatureValid: true,
        body: {
          task: { id: taskId },
          actor: { id: null, name: null },
          data: {
            previousLevel: "arranque",
            previousVerification: true,
            level: "completa",
            verification: true,
            source: "gateway",
            changedByActor: "agent:orq-jaime",
          },
        },
      });
      // The log and the events tell the same story, with the same times.
      const logged = await changes(taskId);
      expect([bySession, byGateway].map((d) => d!.body.data.changedAt)).toEqual(
        logged.slice(1).map((c) => c.changedAt.toISOString()),
      );
      // Nothing sensitive: no emails and no token.
      for (const d of [bySession, byGateway]) {
        expect(d!.raw).not.toContain("@example");
        expect(d!.raw).not.toContain(GATEWAY_TOKEN);
        expect(d!.raw).not.toMatch(/"email"/);
      }
      expect(ofEvent("task.automation_changed")).toHaveLength(2);
    });

    describe("changedAt", () => {
      const FROZEN = new Date("2026-11-02T10:00:00.000Z");

      beforeEach(() => {
        // Only Date: timers, the database and the receiver run for real.
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(FROZEN);
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      async function liveTask() {
        const { app, project } = await setup();
        await db.insert(schema.integrationTable).values({
          projectId: project.id,
          type: "generic-webhook",
          isActive: true,
          config: JSON.stringify({ webhookUrl, secret: SECRET }),
        });
        return { app, taskId: await createdTaskId(app, project.id) };
      }

      // Alternating values, so that every PUT is a change.
      async function change(app: App, taskId: string, i: number) {
        const res = await putAutomation(app, taskId, {
          level: i % 2 === 0 ? "arranque" : "completa",
          verification: true,
        });
        expect(res.status).toBe(200);
      }

      async function eventTimes(count: number) {
        await vi.waitFor(() =>
          expect(ofEvent("task.automation_changed")).toHaveLength(count),
        );
        return ofEvent("task.automation_changed")
          .map((d) => d.body.data.changedAt as string)
          .sort();
      }

      it("grows strictly per task with a frozen clock, the same in the log, the row and the event", async () => {
        const { app, taskId } = await liveTask();
        for (let i = 0; i < 12; i++) await change(app, taskId, i);

        const logged = (await changes(taskId)).map((c) =>
          c.changedAt.getTime(),
        );
        expect(logged).toHaveLength(13);
        // Creation at the frozen time, then one millisecond per change.
        expect(logged).toEqual(
          Array.from({ length: 13 }, (_, i) => FROZEN.getTime() + i),
        );
        expect(await eventTimes(12)).toEqual(
          logged.slice(1).map((t) => new Date(t).toISOString()),
        );
        const [row] = await stored(taskId);
        expect(row!.setAt.getTime()).toBe(logged.at(-1));
        // The history keeps the real order: the last change first.
        const history = await app.request(
          `/api/intelia/task/${taskId}/automation/history`,
        );
        expect(
          ((await history.json()) as Array<{ changedAt: string }>).map((c) =>
            new Date(c.changedAt).getTime(),
          ),
        ).toEqual([...logged].reverse());
      });

      it("keeps growing when the clock goes back", async () => {
        const { app, taskId } = await liveTask();
        await change(app, taskId, 0);
        vi.setSystemTime(new Date(FROZEN.getTime() - 60 * 60 * 1000));
        await change(app, taskId, 1);

        const logged = (await changes(taskId)).map((c) =>
          c.changedAt.getTime(),
        );
        expect(logged).toEqual([
          FROZEN.getTime(),
          FROZEN.getTime() + 1,
          FROZEN.getTime() + 2,
        ]);
        expect(await eventTimes(2)).toEqual(
          logged.slice(1).map((t) => new Date(t).toISOString()),
        );

        // Once the clock is past the last one, it is the clock again.
        vi.setSystemTime(new Date(FROZEN.getTime() + 5000));
        await change(app, taskId, 2);
        expect((await changes(taskId)).at(-1)!.changedAt.getTime()).toBe(
          FROZEN.getTime() + 5000,
        );
      });
    });
  });
});
