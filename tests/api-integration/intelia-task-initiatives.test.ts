import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import {
  initiativeTable,
  taskInitiativeTable,
} from "../../apps/api/src/intelia/schema";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

type App = ReturnType<typeof createApp>["app"];

let nextNumber = 1;

beforeEach(async () => {
  await resetTestDatabase();
  nextNumber = 1;
  vi.restoreAllMocks();
});

async function seedInitiative(projectId: string, name: string) {
  const [initiative] = await db
    .insert(initiativeTable)
    .values({ projectId, name, nameKey: name.toLowerCase(), source: "session" })
    .returning();
  if (!initiative) throw new Error("Failed to seed initiative");
  return initiative;
}

async function seedTask(projectId: string, initiativeId?: string) {
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
    })
    .returning();
  if (!task) throw new Error("Failed to seed task");
  if (initiativeId) {
    await db.insert(taskInitiativeTable).values({
      taskId: task.id,
      initiativeId,
      origin: "plan",
      source: "session",
    });
  }
  return task;
}

async function setup() {
  const { user, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Jaime",
  });
  const { project } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Software Factory",
    slug: "SF",
  });
  const hidden = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Proyecto oculto",
    slug: "HID",
  });
  const motor = await seedInitiative(project.id, "Motor de flujo");
  const gateway = await seedInitiative(project.id, "Gateway");
  const secretInitiative = await seedInitiative(
    hidden.project.id,
    "Iniciativa secreta",
  );
  const inMotor = await seedTask(project.id, motor.id);
  const inGateway = await seedTask(project.id, gateway.id);
  const orphan = await seedTask(project.id);
  const secret = await seedTask(hidden.project.id, secretInitiative.id);
  mockAuthenticatedSession(user);
  return {
    app: createApp().app,
    user,
    workspace,
    project,
    hidden: hidden.project,
    motor,
    gateway,
    inMotor,
    inGateway,
    orphan,
    secret,
  };
}

async function post(
  app: App,
  workspaceId: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const response = await app.request(
    `/api/intelia/workspace/${workspaceId}/task-initiatives`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
  );
  return { status: response.status, body: await response.json() };
}

function byTaskId<T extends { taskId: string }>(entries: T[]) {
  return [...entries].sort((a, b) => a.taskId.localeCompare(b.taskId));
}

describe("POST /api/intelia/workspace/{workspaceId}/task-initiatives", () => {
  it("returns each task's initiative, null without one, and leaves unknown and other workspaces' tasks out", async () => {
    const ctx = await setup();
    const elsewhere = await createWorkspaceMember({ role: "owner" });
    const foreignProject = await createProjectFixture({
      workspaceId: elsewhere.workspace.id,
    });
    const foreignInitiative = await seedInitiative(
      foreignProject.project.id,
      "Ajena",
    );
    const foreign = await seedTask(
      foreignProject.project.id,
      foreignInitiative.id,
    );

    const { status, body } = await post(ctx.app, ctx.workspace.id, {
      taskIds: [
        ctx.inMotor.id,
        ctx.inGateway.id,
        ctx.orphan.id,
        ctx.secret.id,
        ctx.inMotor.id,
        "unknown-task",
        foreign.id,
      ],
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      tasks: byTaskId([
        {
          taskId: ctx.inMotor.id,
          initiativeId: ctx.motor.id,
          initiativeName: "Motor de flujo",
        },
        {
          taskId: ctx.inGateway.id,
          initiativeId: ctx.gateway.id,
          initiativeName: "Gateway",
        },
        { taskId: ctx.orphan.id, initiativeId: null, initiativeName: null },
        {
          taskId: ctx.secret.id,
          initiativeId: expect.any(String),
          initiativeName: "Iniciativa secreta",
        },
      ]),
    });
    expect(JSON.stringify(body)).not.toContain(foreign.id);
  });

  it("leaves out tasks of a project the caller cannot read", async () => {
    const ctx = await setup();
    const reader = await addWorkspaceMember(ctx.workspace.id, "member");
    await restrictToProjects(ctx.workspace.id, reader.id, [ctx.project.id]);
    mockAuthenticatedSession(reader);

    const { status, body } = await post(ctx.app, ctx.workspace.id, {
      taskIds: [ctx.inMotor.id, ctx.orphan.id, ctx.secret.id],
    });

    expect(status).toBe(200);
    expect(body.tasks.map((t: { taskId: string }) => t.taskId)).toEqual(
      [ctx.inMotor.id, ctx.orphan.id].sort(),
    );
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(ctx.secret.id);
    expect(raw).not.toContain("Iniciativa secreta");
  });

  it("works with the API key of a member account", async () => {
    const ctx = await setup();
    const member = await addWorkspaceMember(ctx.workspace.id, "member");
    const { key } = await auth.api.createApiKey({
      body: { userId: member.id, name: "orquestador" },
    });
    mockAnonymousSession();

    const { status, body } = await post(
      ctx.app,
      ctx.workspace.id,
      { taskIds: [ctx.inMotor.id, ctx.orphan.id] },
      { "x-api-key": key },
    );

    expect(status).toBe(200);
    expect(body.tasks).toEqual(
      byTaskId([
        {
          taskId: ctx.inMotor.id,
          initiativeId: ctx.motor.id,
          initiativeName: "Motor de flujo",
        },
        { taskId: ctx.orphan.id, initiativeId: null, initiativeName: null },
      ]),
    );
  });

  it("answers 400 for an empty list, more than 500 ids or an empty id", async () => {
    const ctx = await setup();
    const tooMany = Array.from({ length: 501 }, (_, i) => `task-${i}`);

    for (const body of [
      {},
      { taskIds: [] },
      { taskIds: tooMany },
      { taskIds: [""] },
      { taskIds: "not-a-list" },
    ]) {
      expect((await post(ctx.app, ctx.workspace.id, body)).status).toBe(400);
    }
    const max = Array.from({ length: 500 }, () => ctx.inMotor.id);
    const accepted = await post(ctx.app, ctx.workspace.id, { taskIds: max });
    expect(accepted.status).toBe(200);
    expect(accepted.body.tasks).toHaveLength(1);
  });

  it("refuses without credentials, without task:read and outside the workspace", async () => {
    const ctx = await setup();
    const taskIds = [ctx.inMotor.id];

    mockAnonymousSession();
    expect((await post(ctx.app, ctx.workspace.id, { taskIds })).status).toBe(
      401,
    );

    const member = await addWorkspaceMember(ctx.workspace.id, "member");
    const { key: projectOnly } = await auth.api.createApiKey({
      body: {
        userId: member.id,
        name: "sin-tareas",
        permissions: { project: ["read"] },
      },
    });
    expect(
      (
        await post(
          ctx.app,
          ctx.workspace.id,
          { taskIds },
          { "x-api-key": projectOnly },
        )
      ).status,
    ).toBe(403);

    const outsider = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(outsider.user);
    const outside = await post(ctx.app, ctx.workspace.id, { taskIds });
    expect([403, 404]).toContain(outside.status);
    expect(JSON.stringify(outside.body)).not.toContain(ctx.motor.id);
    expect((await post(ctx.app, "unknown-workspace", { taskIds })).status).toBe(
      404,
    );
  });
});
