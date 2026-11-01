import { eq } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import {
  taskAutomationChangeTable,
  taskAutomationTable,
} from "../../apps/api/src/intelia/schema";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

const GATEWAY_TOKEN = "gateway-service-token-with-32-chars-or-more";

beforeEach(async () => {
  await resetTestDatabase();
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
});
