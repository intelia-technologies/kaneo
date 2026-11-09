// «Pedida» and the requester of a task (design 52 §3.2, IM-04): a task can be
// born in «Pedida», which every project has; its requester reads and comments
// on that task only, without access to the project, and cannot move it or
// change its fields; a rejection or a cancellation ends that access and the
// notice carries the reason; «Lo que he pedido» lists the open requests of
// any project.
import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { taskRequestTable } from "../../apps/api/src/intelia/schema";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

beforeEach(async () => {
  await resetTestDatabase();
});

type App = {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>;
};

function json(
  app: App,
  method: string,
  path: string,
  body?: Record<string, unknown>,
) {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function addColumn(projectId: string, slug: string, isFinal: boolean) {
  const [column] = await db
    .insert(schema.columnTable)
    .values({ projectId, name: slug, slug, position: 10, isFinal })
    .returning();
  return column!;
}

// Two projects: the requester, a restricted member, sees neither; a member of
// Alpha owns the board where the request lands.
async function setup() {
  const { user: owner, workspace } = await createWorkspaceMember({
    role: "owner",
  });
  const alpha = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Alpha",
    slug: "ALP",
  });
  const beta = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Beta",
    slug: "BET",
  });
  for (const { project } of [alpha, beta]) {
    await addColumn(project.id, "cancelled", true);
  }
  const requester = await addWorkspaceMember(workspace.id);
  const outsider = await addWorkspaceMember(workspace.id);
  // A project they do not ask anything of: restricted members need one.
  const other = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Other",
    slug: "OTH",
  });
  await restrictToProjects(workspace.id, requester.id, [other.project.id]);
  await restrictToProjects(workspace.id, outsider.id, [other.project.id]);

  const app = createApp().app;
  return { app, owner, workspace, alpha, beta, requester, outsider };
}

async function createRequested(
  app: App,
  projectId: string,
  requesterId: string,
  title = "Pedir un informe",
) {
  const created = await json(app, "POST", `/api/task/${projectId}`, {
    title,
    description: "Lo necesito para el lunes",
    priority: "medium",
    status: "pedida",
  });
  expect(created.status).toBe(200);
  const task = (await created.json()) as { id: string; status: string };
  expect(task.status).toBe("pedida");
  const set = await json(app, "PUT", `/api/intelia/task/${task.id}/requester`, {
    userId: requesterId,
  });
  expect(set.status).toBe(200);
  return task;
}

describe("the «Pedida» column", () => {
  it("is in every new project, first, and is not where defaults land", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(user);
    const app = createApp().app;
    const res = await json(app, "POST", "/api/project", {
      name: "Nuevo",
      workspaceId: workspace.id,
      icon: "Folder",
      slug: "NEW",
    });
    expect(res.status).toBe(200);
    const project = (await res.json()) as { id: string };
    const columns = await db
      .select({
        slug: schema.columnTable.slug,
        name: schema.columnTable.name,
        isFinal: schema.columnTable.isFinal,
      })
      .from(schema.columnTable)
      .where(eq(schema.columnTable.projectId, project.id))
      .orderBy(asc(schema.columnTable.position));
    expect(columns.map((c) => c.slug)).toEqual([
      "pedida",
      "to-do",
      "in-progress",
      "in-review",
      "done",
    ]);
    expect(columns[0]).toEqual({
      slug: "pedida",
      name: "Pedida",
      isFinal: false,
    });
  });
});

describe("requester access", () => {
  it("reads and comments on their requested task without project access", async () => {
    const { app, owner, workspace, alpha, requester } = await setup();
    mockAuthenticatedSession(owner);
    const task = await createRequested(app, alpha.project.id, requester.id);
    await json(app, "POST", `/api/comment/${task.id}`, {
      content: "Lo miramos esta semana",
    });

    mockAuthenticatedSession(requester);
    const read = await app.request(`/api/intelia/request/${task.id}`);
    expect(read.status).toBe(200);
    const detail = (await read.json()) as Record<string, unknown>;
    expect(detail).toMatchObject({
      taskId: task.id,
      title: "Pedir un informe",
      ticketId: "ALP-1",
      status: "pedida",
      statusName: "Pedida",
      projectName: "Alpha",
      description: "Lo necesito para el lunes",
      requester: { userId: requester.id },
      comments: [{ content: "Lo miramos esta semana", userId: owner.id }],
    });

    const commented = await json(
      app,
      "POST",
      `/api/intelia/request/${task.id}/comments`,
      { content: "Gracias" },
    );
    expect(commented.status).toBe(200);
    const after = (await commented.json()) as {
      comments: Array<{ content: string; userId: string }>;
    };
    expect(after.comments.map((c) => [c.userId, c.content])).toEqual([
      [owner.id, "Lo miramos esta semana"],
      [requester.id, "Gracias"],
    ]);

    // The project's members see the requester's comment in the task.
    mockAuthenticatedSession(owner);
    const comments = await app.request(`/api/comment/${task.id}`);
    expect(
      ((await comments.json()) as Array<{ content: string }>).map(
        (c) => c.content,
      ),
    ).toContain("Gracias");
    expect(workspace.id).toBeTruthy();
  });

  it("never reads other tasks of the project, nor somebody else's request", async () => {
    const { app, owner, alpha, requester, outsider } = await setup();
    mockAuthenticatedSession(owner);
    const mine = await createRequested(app, alpha.project.id, requester.id);
    const [plain] = await db
      .insert(schema.taskTable)
      .values({
        projectId: alpha.project.id,
        title: "Interna",
        status: "to-do",
        columnId: alpha.columns.todo.id,
        number: 99,
      })
      .returning();

    mockAuthenticatedSession(requester);
    // A task of the project they did not ask for: as if it did not exist.
    expect(
      (await app.request(`/api/intelia/request/${plain!.id}`)).status,
    ).toBe(404);
    expect(
      (
        await json(app, "POST", `/api/intelia/request/${plain!.id}/comments`, {
          content: "hola",
        })
      ).status,
    ).toBe(404);
    // Upstream's routes keep the project closed to them.
    expect((await app.request(`/api/task/${mine.id}`)).status).toBe(403);
    expect((await app.request(`/api/task/${plain!.id}`)).status).toBe(403);
    expect((await app.request(`/api/comment/${mine.id}`)).status).toBe(403);
    expect(
      (await app.request(`/api/task/tasks/${alpha.project.id}`)).status,
    ).toBe(403);

    // Another member without access cannot follow somebody else's request.
    mockAuthenticatedSession(outsider);
    expect((await app.request(`/api/intelia/request/${mine.id}`)).status).toBe(
      404,
    );
  });

  it("cannot move the task or change its fields", async () => {
    const { app, owner, alpha, requester } = await setup();
    mockAuthenticatedSession(owner);
    const task = await createRequested(app, alpha.project.id, requester.id);

    mockAuthenticatedSession(requester);
    const attempts = [
      json(app, "PUT", `/api/task/status/${task.id}`, { status: "to-do" }),
      json(app, "PUT", `/api/task/title/${task.id}`, { title: "Otro" }),
      json(app, "PUT", `/api/task/priority/${task.id}`, { priority: "high" }),
      json(app, "PUT", `/api/task/description/${task.id}`, {
        description: "x",
      }),
      json(app, "PUT", `/api/task/assignee/${task.id}`, {
        userId: requester.id,
      }),
      json(app, "PUT", `/api/task/move/${task.id}`, {
        destinationProjectId: alpha.project.id,
      }),
      json(app, "POST", `/api/intelia/task/${task.id}/reject`, {
        reason: "no",
      }),
      json(app, "PUT", `/api/intelia/task/${task.id}/requester`, {
        userId: requester.id,
      }),
      json(app, "DELETE", `/api/intelia/task/${task.id}/requester`),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
    }
    const [row] = await db
      .select({
        status: schema.taskTable.status,
        title: schema.taskTable.title,
        priority: schema.taskTable.priority,
      })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    expect(row).toEqual({
      status: "pedida",
      title: "Pedir un informe",
      priority: "medium",
    });
  });

  it("loses access on rejection, and the notice carries the reason", async () => {
    const { app, owner, workspace, alpha, requester } = await setup();
    mockAuthenticatedSession(owner);
    const task = await createRequested(app, alpha.project.id, requester.id);

    const rejected = await json(
      app,
      "POST",
      `/api/intelia/task/${task.id}/reject`,
      { reason: "No es de este equipo" },
    );
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).toMatchObject({
      closedReason: "No es de este equipo",
    });
    const [moved] = await db
      .select({ status: schema.taskTable.status })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    expect(moved!.status).toBe("cancelled");

    mockAuthenticatedSession(requester);
    expect((await app.request(`/api/intelia/request/${task.id}`)).status).toBe(
      404,
    );
    expect(
      (
        await json(app, "POST", `/api/intelia/request/${task.id}/comments`, {
          content: "¿Por qué?",
        })
      ).status,
    ).toBe(404);

    const notices = await db
      .select()
      .from(schema.notificationTable)
      .where(
        and(
          eq(schema.notificationTable.userId, requester.id),
          eq(schema.notificationTable.type, "task_request_closed"),
        ),
      );
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      title: "Request rejected: Pedir un informe",
      content: "No es de este equipo",
      resourceType: "workspace",
      resourceId: workspace.id,
      eventData: {
        taskId: task.id,
        projectName: "Alpha",
        reason: "No es de este equipo",
      },
    });
    // The requester reads it from their inbox.
    const inbox = await app.request(
      `/api/notification?workspaceId=${workspace.id}`,
    );
    expect(inbox.status).toBe(200);
    expect(JSON.stringify(await inbox.json())).toContain(
      "No es de este equipo",
    );
  });

  it("loses access when the task is cancelled any other way, notified once", async () => {
    const { app, owner, alpha, requester } = await setup();
    mockAuthenticatedSession(owner);
    const task = await createRequested(app, alpha.project.id, requester.id);

    const res = await json(app, "PUT", `/api/task/status/${task.id}`, {
      status: "cancelled",
    });
    expect(res.status).toBe(200);
    await vi.waitFor(async () => {
      const [row] = await db
        .select({ closedAt: taskRequestTable.closedAt })
        .from(taskRequestTable)
        .where(eq(taskRequestTable.taskId, task.id));
      expect(row!.closedAt).toBeInstanceOf(Date);
    });
    // Another event on the same cancelled task does not notify again.
    await json(app, "PUT", `/api/task/title/${task.id}`, { title: "Otra" });

    mockAuthenticatedSession(requester);
    expect((await app.request(`/api/intelia/request/${task.id}`)).status).toBe(
      404,
    );
    await vi.waitFor(async () => {
      const notices = await db
        .select()
        .from(schema.notificationTable)
        .where(eq(schema.notificationTable.type, "task_request_closed"));
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        userId: requester.id,
        title: "Request cancelled: Pedir un informe",
        eventData: { reason: null },
      });
    });
  });

  it("gets access back if the task leaves the cancelled column", async () => {
    const { app, owner, alpha, requester } = await setup();
    mockAuthenticatedSession(owner);
    const task = await createRequested(app, alpha.project.id, requester.id);
    await json(app, "POST", `/api/intelia/task/${task.id}/reject`, {
      reason: "Por error",
    });
    await json(app, "PUT", `/api/task/status/${task.id}`, { status: "to-do" });
    await vi.waitFor(async () => {
      const [row] = await db
        .select({ closedAt: taskRequestTable.closedAt })
        .from(taskRequestTable)
        .where(eq(taskRequestTable.taskId, task.id));
      expect(row!.closedAt).toBeNull();
    });
    mockAuthenticatedSession(requester);
    expect((await app.request(`/api/intelia/request/${task.id}`)).status).toBe(
      200,
    );
  });
});

describe("«Lo que he pedido»", () => {
  it("lists the caller's open requests of any project, newest first", async () => {
    const { app, owner, workspace, alpha, beta, requester, outsider } =
      await setup();
    mockAuthenticatedSession(owner);
    const first = await createRequested(
      app,
      alpha.project.id,
      requester.id,
      "Primera",
    );
    const second = await createRequested(
      app,
      beta.project.id,
      requester.id,
      "Segunda",
    );
    const rejected = await createRequested(
      app,
      beta.project.id,
      requester.id,
      "Rechazada",
    );
    await createRequested(app, alpha.project.id, outsider.id, "De otro");
    await json(app, "POST", `/api/intelia/task/${rejected.id}/reject`, {
      reason: "no",
    });

    mockAuthenticatedSession(requester);
    const res = await app.request(
      `/api/intelia/workspace/${workspace.id}/requests`,
    );
    expect(res.status).toBe(200);
    const { requests } = (await res.json()) as {
      requests: Array<{ taskId: string; projectName: string; title: string }>;
    };
    expect(requests.map((r) => [r.title, r.projectName])).toEqual([
      ["Segunda", "Beta"],
      ["Primera", "Alpha"],
    ]);
    expect(requests.map((r) => r.taskId)).toEqual([second.id, first.id]);
  });
});

describe("setting the requester", () => {
  it("needs a workspace member, a live task, and can be removed", async () => {
    const { app, owner, alpha, requester } = await setup();
    const stranger = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(owner);
    const task = await createRequested(app, alpha.project.id, requester.id);

    const notMember = await json(
      app,
      "PUT",
      `/api/intelia/task/${task.id}/requester`,
      { userId: stranger.user.id },
    );
    expect(notMember.status).toBe(400);
    expect(await notMember.json()).toMatchObject({
      code: "REQUESTER_NOT_MEMBER",
    });

    const read = await app.request(`/api/intelia/task/${task.id}/requester`);
    expect(await read.json()).toMatchObject({
      requester: { userId: requester.id },
      closedAt: null,
    });

    expect(
      (await json(app, "DELETE", `/api/intelia/task/${task.id}/requester`))
        .status,
    ).toBe(200);
    expect(
      await (
        await app.request(`/api/intelia/task/${task.id}/requester`)
      ).json(),
    ).toBeNull();
    mockAuthenticatedSession(requester);
    expect((await app.request(`/api/intelia/request/${task.id}`)).status).toBe(
      404,
    );

    mockAuthenticatedSession(owner);
    await json(app, "PUT", `/api/task/status/${task.id}`, {
      status: "cancelled",
    });
    const cancelled = await json(
      app,
      "PUT",
      `/api/intelia/task/${task.id}/requester`,
      { userId: requester.id },
    );
    expect(cancelled.status).toBe(409);
  });

  it("rejects only a requested task still in «Pedida»", async () => {
    const { app, owner, alpha, requester } = await setup();
    mockAuthenticatedSession(owner);
    const task = await createRequested(app, alpha.project.id, requester.id);
    await json(app, "PUT", `/api/task/status/${task.id}`, { status: "to-do" });
    const late = await json(
      app,
      "POST",
      `/api/intelia/task/${task.id}/reject`,
      {
        reason: "tarde",
      },
    );
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({
      code: "TASK_NOT_PENDING_REQUEST",
    });
    const empty = await json(
      app,
      "POST",
      `/api/intelia/task/${task.id}/reject`,
      { reason: "   " },
    );
    expect(empty.status).toBe(400);
  });
});
