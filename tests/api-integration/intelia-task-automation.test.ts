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
import { createNextOccurrence } from "../../apps/api/src/task/recurrence/create-next-occurrence";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

// The former service token's variables: they must authenticate nothing now.
const FORMER_TOKEN = "former-gateway-service-token-32-chars-or-more";
const DECLARED = "agent:orq-jaime";

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
  vi.stubEnv("INTELIA_GATEWAY_TOKEN", FORMER_TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// A workspace member that only holds an API key, the way the factory's gateway
// calls Kaneo. `scope` limits the key itself, on top of the member's role.
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
  // A member account with task:update, through its API key.
  const { account: roleAccount, key: roleKey } = await keyAccount(
    workspace.id,
    "coder",
    "member",
  );
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
      type: "diseno",
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

  describe("an account's API key", () => {
    it.each([
      ["x-api-key", (key: string) => ({ "x-api-key": key })],
      ["a bearer token", (key: string) => ({ authorization: `Bearer ${key}` })],
    ])(
      "with task:update writes as its account, with the actor it declares (%s)",
      async (_how, headersOf) => {
        const { app, project, roleKey, roleAccount, user } = await setup();
        const taskId = await createdTaskId(app, project.id);
        mockAnonymousSession();
        const headers = headersOf(roleKey);

        const res = await putAutomation(
          app,
          taskId,
          { level: "arranque", verification: true, actor: DECLARED },
          headers,
        );

        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
          taskId,
          level: "arranque",
          verification: true,
          source: "api_key",
          setByUserId: roleAccount.user.id,
          setByName: "coder",
          setByActor: DECLARED,
        });
        expect(await stored(taskId)).toEqual([
          expect.objectContaining({
            level: "arranque",
            source: "api_key",
            setByUserId: roleAccount.user.id,
            setByActor: DECLARED,
          }),
        ]);
        expect(await changes(taskId)).toEqual([
          expect.objectContaining({
            level: "manual",
            source: "session",
            changedByUserId: user.id,
            changedByActor: null,
          }),
          expect.objectContaining({
            previousLevel: "manual",
            previousVerification: true,
            level: "arranque",
            verification: true,
            source: "api_key",
            changedByUserId: roleAccount.user.id,
            changedByActor: DECLARED,
          }),
        ]);
        // The same key reads the level, its log and the project's levels.
        const history = await app.request(
          `/api/intelia/task/${taskId}/automation/history`,
          { headers },
        );
        expect(history.status).toBe(200);
        expect(await history.json()).toEqual([
          expect.objectContaining({
            level: "arranque",
            source: "api_key",
            changedByName: "coder",
            changedByActor: DECLARED,
          }),
          expect.objectContaining({ level: "manual", source: "session" }),
        ]);
        const list = await app.request(
          `/api/intelia/project/${project.id}/automation`,
          { headers },
        );
        expect(await list.json()).toEqual([
          expect.objectContaining({ taskId, level: "arranque" }),
        ]);
      },
    );

    it("without `actor` writes as its account alone", async () => {
      const { app, project, roleKey, roleAccount } = await setup();
      const taskId = await createdTaskId(app, project.id);
      mockAnonymousSession();

      const res = await putAutomation(
        app,
        taskId,
        { level: "completa", verification: true },
        { "x-api-key": roleKey },
      );

      expect(res.status).toBe(200);
      expect((await changes(taskId)).at(-1)).toMatchObject({
        level: "completa",
        source: "api_key",
        changedByUserId: roleAccount.user.id,
        changedByActor: null,
      });
    });

    it("keeps a declared actor of exactly 100 characters", async () => {
      const { app, project, roleKey } = await setup();
      const taskId = await createdTaskId(app, project.id);
      mockAnonymousSession();
      const longest = `agent:${"a".repeat(94)}`;

      const res = await putAutomation(
        app,
        taskId,
        { level: "arranque", verification: false, actor: longest },
        { "x-api-key": roleKey },
      );

      expect(res.status).toBe(200);
      expect((await changes(taskId)).at(-1)?.changedByActor).toBe(longest);
    });

    it.each([
      ["101 characters", `agent:${"a".repeat(95)}`],
      ["another kind of id", "role:coder"],
      ["upper case", "agent:Orq-Jaime"],
      ["an underscore", "agent:orq_jaime"],
      ["an email", "person:jaime@example.com"],
      ["no name", "agent:"],
      ["spaces around", " agent:orq-jaime "],
      ["an empty string", ""],
      ["a number", 42],
      ["null", null],
      ["an object", { id: DECLARED }],
    ])(
      "ignores an invalid declared actor (%s): the write goes through as the key's account only",
      async (_what, actor) => {
        const { app, project, roleKey, roleAccount } = await setup();
        const taskId = await createdTaskId(app, project.id);
        mockAnonymousSession();

        const res = await putAutomation(
          app,
          taskId,
          { level: "arranque", verification: true, actor },
          { "x-api-key": roleKey },
        );

        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
          source: "api_key",
          setByUserId: roleAccount.user.id,
          setByActor: null,
        });
        expect((await changes(taskId)).at(-1)).toMatchObject({
          level: "arranque",
          source: "api_key",
          changedByUserId: roleAccount.user.id,
          changedByActor: null,
        });
      },
    );

    it("answers 403 to the key of a viewer account, which can still read the level", async () => {
      const { app, project } = await setup();
      const taskId = await createdTaskId(app, project.id);
      const viewer = await keyAccount(project.workspaceId, "viewer", "viewer");
      mockAnonymousSession();

      const write = await putAutomation(
        app,
        taskId,
        { level: "completa", verification: true, actor: DECLARED },
        { "x-api-key": viewer.key },
      );
      const read = await app.request(`/api/intelia/task/${taskId}/automation`, {
        headers: { "x-api-key": viewer.key },
      });

      expect(write.status).toBe(403);
      expect(await readErrorBody(write)).toMatchObject({
        code: "MISSING_PERMISSION",
        missingPermissions: ["task:update"],
      });
      expect(read.status).toBe(200);
      expect(await stored(taskId)).toEqual([
        expect.objectContaining({ level: "manual", source: "session" }),
      ]);
      expect(await changes(taskId)).toHaveLength(1);
    });

    it("answers 403 to a member's key scoped without task:update", async () => {
      const { app, project } = await setup();
      const taskId = await createdTaskId(app, project.id);
      const scoped = await keyAccount(project.workspaceId, "lector", "member", {
        task: ["read"],
      });
      mockAnonymousSession();

      const res = await putAutomation(
        app,
        taskId,
        { level: "completa", verification: true },
        { "x-api-key": scoped.key },
      );

      expect(res.status).toBe(403);
      expect(await readErrorBody(res)).toMatchObject({
        code: "API_KEY_SCOPE",
        missingPermissions: ["task:update"],
      });
      expect(await changes(taskId)).toHaveLength(1);
    });

    it("answers 404 to the key of an account outside the task's workspace, as Kaneo does for any task it cannot see", async () => {
      const { app, project } = await setup();
      const taskId = await createdTaskId(app, project.id);
      // Owner of its own workspace, with every permission there, none here.
      const outsider = await createWorkspaceMember({
        role: "owner",
        userName: "ajena",
      });
      const { key } = await auth.api.createApiKey({
        body: { userId: outsider.user.id, name: "ajena" },
      });
      mockAnonymousSession();

      const write = await putAutomation(
        app,
        taskId,
        { level: "completa", verification: true, actor: DECLARED },
        { "x-api-key": key },
      );
      const read = await app.request(`/api/intelia/task/${taskId}/automation`, {
        headers: { "x-api-key": key },
      });

      expect(write.status).toBe(404);
      expect(read.status).toBe(404);
      expect(await changes(taskId)).toHaveLength(1);
    });

    it("answers 401 without credentials and with an unknown key", async () => {
      const { app, project, roleKey } = await setup();
      const taskId = await createdTaskId(app, project.id);
      mockAnonymousSession();
      const body = { level: "completa", verification: true, actor: DECLARED };

      const none = await putAutomation(app, taskId, body);
      const unknown = await putAutomation(app, taskId, body, {
        "x-api-key": `${roleKey}x`,
      });
      const unknownBearer = await putAutomation(app, taskId, body, {
        authorization: `Bearer ${roleKey}x`,
      });

      expect(none.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(unknownBearer.status).toBe(401);
      expect(await changes(taskId)).toHaveLength(1);
    });

    it("answers 404 for a task that does not exist", async () => {
      const { app, roleKey } = await setup();
      mockAnonymousSession();

      const res = await putAutomation(
        app,
        "missing-task",
        { level: "manual", verification: true, actor: DECLARED },
        { "x-api-key": roleKey },
      );

      expect(res.status).toBe(404);
    });

    it.each([
      ["the level", "task_automation"],
      ["the change log", "task_automation_change"],
    ])(
      "keeps the previous level when %s cannot be written, and a retry writes once",
      async (_what, table) => {
        const { app, project, roleKey, roleAccount } = await setup();
        const taskId = await createdTaskId(app, project.id);
        mockAnonymousSession();
        const body = { level: "arranque", verification: true, actor: DECLARED };
        const key = { "x-api-key": roleKey };
        // An upsert of the level fires the insert trigger too.
        await db.execute(
          sql.raw(`CREATE OR REPLACE FUNCTION intelia.au02c_test_fail() RETURNS trigger
            LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$`),
        );
        await db.execute(
          sql.raw(`CREATE TRIGGER au02c_test_fail BEFORE INSERT ON intelia.${table}
            FOR EACH ROW EXECUTE FUNCTION intelia.au02c_test_fail()`),
        );
        let failed: Response;
        try {
          failed = await putAutomation(app, taskId, body, key);
        } finally {
          await db.execute(
            sql.raw(
              `DROP TRIGGER au02c_test_fail ON intelia.${table}; DROP FUNCTION intelia.au02c_test_fail()`,
            ),
          );
        }

        expect(failed.status).toBe(500);
        expect(await stored(taskId)).toEqual([
          expect.objectContaining({ level: "manual", source: "session" }),
        ]);
        expect(await changes(taskId)).toHaveLength(1);

        const retry = await putAutomation(app, taskId, body, key);

        expect(retry.status).toBe(200);
        expect(await changes(taskId)).toEqual([
          expect.objectContaining({ level: "manual" }),
          expect.objectContaining({
            level: "arranque",
            changedByUserId: roleAccount.user.id,
            changedByActor: DECLARED,
          }),
        ]);
      },
    );
  });

  describe("the former service token", () => {
    const token = { "x-service-token": FORMER_TOKEN };

    it("authenticates nothing on its own, even with INTELIA_GATEWAY_TOKEN set", async () => {
      const { app, project } = await setup();
      const taskId = await createdTaskId(app, project.id);
      mockAnonymousSession();

      const write = await putAutomation(
        app,
        taskId,
        { level: "completa", verification: true, actor: DECLARED },
        token,
      );
      const reads = await Promise.all(
        [
          `/api/intelia/task/${taskId}/automation`,
          `/api/intelia/task/${taskId}/automation/history`,
          `/api/intelia/project/${project.id}/automation`,
        ].map((path) => app.request(path, { headers: token })),
      );

      expect(write.status).toBe(401);
      expect(reads.map((r) => r.status)).toEqual([401, 401, 401]);
      expect(await changes(taskId)).toHaveLength(1);
    });

    it("is ignored next to a session or a key: the write is theirs", async () => {
      const { app, project, user, roleKey, roleAccount } = await setup();
      const taskId = await createdTaskId(app, project.id);

      const bySession = await putAutomation(
        app,
        taskId,
        { level: "arranque", verification: true },
        token,
      );
      // A session still may not name an actor, token or not.
      const sessionActor = await putAutomation(
        app,
        taskId,
        { level: "completa", verification: true, actor: DECLARED },
        token,
      );
      mockAnonymousSession();
      const byKey = await putAutomation(
        app,
        taskId,
        { level: "completa", verification: true, actor: DECLARED },
        { ...token, "x-api-key": roleKey },
      );

      expect([bySession.status, sessionActor.status, byKey.status]).toEqual([
        200, 400, 200,
      ]);
      expect(
        (await changes(taskId)).map((c) => [
          c.level,
          c.source,
          c.changedByUserId,
          c.changedByActor,
        ]),
      ).toEqual([
        ["manual", "session", user.id, null],
        ["arranque", "session", user.id, null],
        ["completa", "api_key", roleAccount.user.id, DECLARED],
      ]);
    });
  });

  // Design 48 §3.2 (NU-01k): the new core's fields, by the same endpoints.
  describe("the fields of the new dispatcher core", () => {
    const FIELD_KEYS = [
      "automatica",
      "columnaPrevia",
      "entrega",
      "implementador",
      "level",
      "pausaMotivo",
      "responsable",
      "setAt",
      "setByActor",
      "setByName",
      "setByUserId",
      "source",
      "taskId",
      "verificador",
      "verification",
    ];

    async function read(app: App, taskId: string) {
      const res = await app.request(`/api/intelia/task/${taskId}/automation`);
      expect(res.status).toBe(200);
      return (await res.json()) as Record<string, unknown>;
    }

    async function listed(app: App, projectId: string, taskId: string) {
      const res = await app.request(
        `/api/intelia/project/${projectId}/automation`,
      );
      expect(res.status).toBe(200);
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      return rows.find((row) => row.taskId === taskId);
    }

    it("creates a task with automatica instead of the level, and both reads give every field in camelCase", async () => {
      const { app, project } = await setup();
      const res = await createTask(app, project.id, {
        automation: {
          automatica: true,
          verification: false,
          entrega: "pr",
          responsable: "agent:forja",
        },
      });
      expect(res.status).toBe(200);
      const taskId = ((await res.json()) as { id: string }).id;

      const expected = {
        taskId,
        level: "arranque",
        verification: false,
        automatica: true,
        pausaMotivo: null,
        entrega: "pr",
        responsable: "agent:forja",
        implementador: null,
        verificador: null,
        columnaPrevia: null,
      };
      const one = await read(app, taskId);
      expect(one).toMatchObject(expected);
      expect(Object.keys(one).sort()).toEqual(FIELD_KEYS);
      // The list the dispatcher reads (R12 of NU-12 looks for `pausaMotivo`).
      const inList = await listed(app, project.id, taskId);
      expect(inList).toMatchObject(expected);
      expect(Object.keys(inList ?? {}).sort()).toEqual(FIELD_KEYS);
      expect((await changes(taskId))[0]).toMatchObject({
        previousAutomatica: null,
        automatica: true,
        entrega: "pr",
      });
    });

    it("pauses with a reason, lists the pause, and resuming clears it", async () => {
      const { app, project } = await setup();
      const created = await createTask(app, project.id, {
        automation: { level: "completa", verification: true },
      });
      const taskId = ((await created.json()) as { id: string }).id;

      const paused = await putAutomation(app, taskId, {
        automatica: false,
        pausaMotivo: "  movida_a_mano ",
      });
      expect(paused.status).toBe(200);
      expect(await paused.json()).toMatchObject({
        automatica: false,
        level: "manual",
        pausaMotivo: "movida_a_mano",
        verification: true,
      });
      expect(await listed(app, project.id, taskId)).toMatchObject({
        automatica: false,
        pausaMotivo: "movida_a_mano",
      });

      // Changing the reason alone keeps it paused.
      const reason = await putAutomation(app, taskId, {
        pausaMotivo: "transicion_desconocida",
      });
      expect(await reason.json()).toMatchObject({
        automatica: false,
        pausaMotivo: "transicion_desconocida",
      });

      const resumed = await putAutomation(app, taskId, { automatica: true });
      expect(await resumed.json()).toMatchObject({
        automatica: true,
        level: "arranque",
        pausaMotivo: null,
      });
      expect(
        (await changes(taskId)).map((c) => [
          c.previousAutomatica,
          c.automatica,
          c.level,
          c.pausaMotivo,
        ]),
      ).toEqual([
        [null, true, "completa", null],
        [true, false, "manual", "movida_a_mano"],
        [false, false, "manual", "transicion_desconocida"],
        [false, true, "arranque", null],
      ]);
    });

    it("turning automatica on keeps arranque or a verified completa, and drops an unverified completa to arranque", async () => {
      const { app, project } = await setup();
      const created = await createTask(app, project.id, {
        automation: { level: "completa", verification: true },
      });
      const taskId = ((await created.json()) as { id: string }).id;

      const same = await putAutomation(app, taskId, { automatica: true });
      expect(await same.json()).toMatchObject({ level: "completa" });
      expect(await changes(taskId)).toHaveLength(1);

      const unverified = await putAutomation(app, taskId, {
        verification: false,
      });
      expect(unverified.status).toBe(200);
      expect(await unverified.json()).toMatchObject({
        level: "arranque",
        automatica: true,
        verification: false,
      });
    });

    it("stores the dispatcher's bookkeeping without logging a change or changing the author", async () => {
      const { app, project, roleKey } = await setup();
      const taskId = await createdTaskId(app, project.id);
      const [before] = await stored(taskId);

      mockAnonymousSession();
      const res = await putAutomation(
        app,
        taskId,
        {
          implementador: "agent:coder-b12cd39a",
          verificador: "agent:verificador-1",
          responsable: "agent:forja",
          columnaPrevia: "in-progress",
        },
        { "x-api-key": roleKey },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        implementador: "agent:coder-b12cd39a",
        verificador: "agent:verificador-1",
        responsable: "agent:forja",
        columnaPrevia: "in-progress",
        source: "session",
        setByUserId: before!.setByUserId,
      });
      expect(await changes(taskId)).toHaveLength(1);

      // Null clears one; what is omitted stays.
      const cleared = await putAutomation(
        app,
        taskId,
        { columnaPrevia: null },
        { "x-api-key": roleKey },
      );
      expect(await cleared.json()).toMatchObject({
        columnaPrevia: null,
        implementador: "agent:coder-b12cd39a",
      });
    });

    it.each([
      ["a reason with automatica on", { automatica: true, pausaMotivo: "x" }],
      ["a level against automatica", { level: "manual", automatica: true }],
      ["an empty reason", { automatica: false, pausaMotivo: "   " }],
      ["a reason of two lines", { automatica: false, pausaMotivo: "a\nb" }],
      [
        "a reason over 500 characters",
        { automatica: false, pausaMotivo: "x".repeat(501) },
      ],
      ["an unknown delivery", { entrega: "merge" }],
      ["a role that is not a graph id", { implementador: "Coder B" }],
      ["a column that is not a slug", { columnaPrevia: "In Progress" }],
    ])("rejects %s and keeps the stored value", async (_what, body) => {
      const { app, project } = await setup();
      const taskId = await createdTaskId(app, project.id);
      const [before] = await stored(taskId);

      const res = await putAutomation(app, taskId, body);

      expect(res.status).toBe(400);
      expect(await readErrorBody(res)).toMatchObject({
        code: "VALIDATION_ERROR",
      });
      expect(await stored(taskId)).toEqual([before]);
    });

    it("rejects a reason for a task whose stored automatica is on", async () => {
      const { app, project } = await setup();
      const created = await createTask(app, project.id, {
        automation: { automatica: true, verification: true },
      });
      const taskId = ((await created.json()) as { id: string }).id;

      const res = await putAutomation(app, taskId, { pausaMotivo: "x" });

      expect(res.status).toBe(400);
      expect(await readErrorBody(res)).toMatchObject({
        issues: [expect.objectContaining({ path: "body.pausaMotivo" })],
      });
    });

    it("needs automatica or the level, and the verification, for a task's first value", async () => {
      const { app, project } = await setup();
      const noLevel = await createTask(app, project.id, {
        automation: { verification: true, entrega: "pr" },
      });
      expect(noLevel.status).toBe(400);
      expect(await taskCount()).toBe(0);

      // A task without a row (closed before the backfill) through PUT.
      const taskId = await createdTaskId(app, project.id);
      await db
        .delete(taskAutomationTable)
        .where(eq(taskAutomationTable.taskId, taskId));
      const partial = await putAutomation(app, taskId, { entrega: "pr" });
      expect(partial.status).toBe(400);
      expect(await stored(taskId)).toEqual([]);
      const full = await putAutomation(app, taskId, {
        automatica: false,
        verification: true,
        pausaMotivo: "pausa",
      });
      expect(await full.json()).toMatchObject({
        level: "manual",
        pausaMotivo: "pausa",
      });
    });

    it("a copy inherits what the planner chose, not the pause, the instances or the column", async () => {
      const { app, project } = await setup();
      const created = await createTask(app, project.id, {
        automation: {
          automatica: false,
          verification: false,
          pausaMotivo: "movida_a_mano",
          entrega: "sin_pr",
          responsable: "agent:forja",
          implementador: "agent:coder-1",
          verificador: "agent:verificador-1",
          columnaPrevia: "in-review",
        },
      });
      const sourceId = ((await created.json()) as { id: string }).id;

      const res = await app.request(`/api/task/duplicate/${sourceId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(200);
      const copyId = ((await res.json()) as { id: string }).id;
      expect(await read(app, copyId)).toMatchObject({
        level: "manual",
        automatica: false,
        verification: false,
        pausaMotivo: null,
        entrega: "sin_pr",
        responsable: "agent:forja",
        implementador: null,
        verificador: null,
        columnaPrevia: null,
      });
    });

    it("a copy with the web dialog's automation keeps the source's responsible", async () => {
      const { app, project } = await setup();
      const created = await createTask(app, project.id, {
        automation: {
          automatica: false,
          verification: false,
          entrega: "sin_pr",
          responsable: "agent:forja",
        },
      });
      const sourceId = ((await created.json()) as { id: string }).id;
      const copy = async (body: Record<string, unknown>) => {
        const res = await app.request(`/api/task/duplicate/${sourceId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        expect(res.status).toBe(200);
        return read(app, ((await res.json()) as { id: string }).id);
      };

      // What `DuplicateAutomationDialog` sends: automatica, verification and
      // delivery, never the responsible.
      expect(
        await copy({
          automation: { automatica: true, verification: true, entrega: "pr" },
        }),
      ).toMatchObject({
        level: "arranque",
        automatica: true,
        verification: true,
        entrega: "pr",
        responsable: "agent:forja",
      });
      expect(await copy({})).toMatchObject({
        automatica: false,
        verification: false,
        entrega: "sin_pr",
        responsable: "agent:forja",
      });
      // A responsible in the body still wins, null included.
      expect(
        await copy({
          automation: {
            automatica: false,
            verification: true,
            responsable: "person:jaime",
          },
        }),
      ).toMatchObject({ responsable: "person:jaime" });
      expect(
        await copy({
          automation: {
            automatica: false,
            verification: true,
            responsable: null,
          },
        }),
      ).toMatchObject({ responsable: null });
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

    it("goes out once per change, from a session and from an API key, and not on creation", async () => {
      const { app, project, user, roleKey, roleAccount } = await setup();
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
      const byKey = await putAutomation(
        app,
        taskId,
        { level: "completa", verification: true, actor: DECLARED },
        { "x-api-key": roleKey },
      );
      expect(byKey.status).toBe(200);
      await vi.waitFor(() =>
        expect(ofEvent("task.automation_changed")).toHaveLength(2),
      );
      // An invalid declared actor is not in the event either.
      const invalidActor = await putAutomation(
        app,
        taskId,
        { level: "manual", verification: false, actor: "Agent:Orq" },
        { "x-api-key": roleKey },
      );
      expect(invalidActor.status).toBe(200);
      await vi.waitFor(() =>
        expect(ofEvent("task.automation_changed")).toHaveLength(3),
      );

      const [bySession, byKeyEvent, byInvalid] = ofEvent(
        "task.automation_changed",
      );
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
            previousAutomatica: false,
            automatica: true,
            previousPausaMotivo: null,
            pausaMotivo: null,
            previousEntrega: null,
            entrega: null,
            source: "session",
            changedByActor: null,
            changedAt: expect.any(String),
          },
        },
      });
      expect(byKeyEvent).toMatchObject({
        signatureValid: true,
        body: {
          task: { id: taskId },
          actor: { id: roleAccount.user.id, name: "coder" },
          data: {
            previousLevel: "arranque",
            previousVerification: true,
            level: "completa",
            verification: true,
            source: "api_key",
            changedByActor: DECLARED,
          },
        },
      });
      expect(byInvalid).toMatchObject({
        body: {
          actor: { id: roleAccount.user.id, name: "coder" },
          data: {
            previousLevel: "completa",
            level: "manual",
            verification: false,
            source: "api_key",
            changedByActor: null,
          },
        },
      });
      // The log and the events tell the same story, with the same times.
      const events = [bySession, byKeyEvent, byInvalid];
      const logged = await changes(taskId);
      expect(events.map((d) => d!.body.data.changedAt)).toEqual(
        logged.slice(1).map((c) => c.changedAt.toISOString()),
      );
      // Nothing sensitive: no emails and no key.
      for (const d of events) {
        expect(d!.raw).not.toContain("@example");
        expect(d!.raw).not.toContain(roleKey);
        expect(d!.raw).not.toMatch(/"email"/);
      }
      expect(ofEvent("task.automation_changed")).toHaveLength(3);
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
        const { app, project, roleKey } = await setup();
        await db.insert(schema.integrationTable).values({
          projectId: project.id,
          type: "generic-webhook",
          isActive: true,
          config: JSON.stringify({ webhookUrl, secret: SECRET }),
        });
        return { app, roleKey, taskId: await createdTaskId(app, project.id) };
      }

      // Alternating values, so that every PUT is a change.
      async function change(
        app: App,
        taskId: string,
        i: number,
        headers: Record<string, string> = {},
      ) {
        const res = await putAutomation(
          app,
          taskId,
          {
            level: i % 2 === 0 ? "arranque" : "completa",
            verification: true,
          },
          headers,
        );
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

      it("grows strictly per task with a frozen clock, from sessions and keys alike, the same in the log, the row and the event", async () => {
        const { app, roleKey, taskId } = await liveTask();
        // Every other change through the API key.
        for (let i = 0; i < 12; i++) {
          await change(app, taskId, i, i % 2 ? { "x-api-key": roleKey } : {});
        }
        expect((await changes(taskId)).map((c) => c.source)).toEqual([
          "session",
          ...Array.from({ length: 12 }, (_, i) =>
            i % 2 ? "api_key" : "session",
          ),
        ]);

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

      it("duplicate, recurrence and import log copies under the same rule and send no change event", async () => {
        const { app, project, columns } = await setup();
        await db.insert(schema.integrationTable).values({
          projectId: project.id,
          type: "generic-webhook",
          isActive: true,
          config: JSON.stringify({ webhookUrl, secret: SECRET }),
        });
        const sourceId = await createdTaskId(app, project.id);

        const dup = await app.request(`/api/task/duplicate/${sourceId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        expect(dup.status).toBe(200);
        const copyId = ((await dup.json()) as { id: string }).id;

        const imported = await app.request(`/api/task/import/${project.id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tasks: [{ title: "Importada", status: "to-do", type: "diseno" }],
            automation: { level: "arranque", verification: false },
          }),
        });
        expect(imported.status).toBe(200);
        const [importedTask] = await db
          .select({ id: schema.taskTable.id })
          .from(schema.taskTable)
          .where(eq(schema.taskTable.title, "Importada"));

        await db
          .update(schema.taskTable)
          .set({
            status: "done",
            columnId: columns.done.id,
            recurrence: { frequency: "weekly", interval: 1, timeZone: "UTC" },
          })
          .where(eq(schema.taskTable.id, sourceId));
        const occurrence = await createNextOccurrence(sourceId, null);
        expect(occurrence).not.toBeNull();

        // Each copy starts its own log at the frozen clock, and a later change
        // of that copy follows it by one millisecond.
        const copies = [copyId, importedTask!.id, occurrence!.id];
        for (const [i, id] of copies.entries()) {
          await change(app, id, i);
          expect((await changes(id)).map((c) => c.changedAt.getTime())).toEqual(
            [FROZEN.getTime(), FROZEN.getTime() + 1],
          );
        }

        // Only the three PUTs send task.automation_changed; the copies sent
        // task.created (duplicate and import) and nothing else.
        const times = await eventTimes(3);
        expect(
          ofEvent("task.automation_changed")
            .map((d) => d.body.task.id)
            .sort(),
        ).toEqual([...copies].sort());
        expect(times).toEqual(
          Array(3).fill(new Date(FROZEN.getTime() + 1).toISOString()),
        );
      });
    });
  });
});
