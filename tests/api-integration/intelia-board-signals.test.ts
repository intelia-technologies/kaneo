import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type App = {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>;
};

beforeEach(async () => {
  await resetTestDatabase();
  vi.restoreAllMocks();
});

// The factory's dispatcher: a workspace member that only holds an API key.
async function keyAccount(
  workspaceId: string,
  userName: string,
  role: "member" | "viewer",
) {
  const account = await createWorkspaceMember({ userName });
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: account.user.id,
    role,
    joinedAt: new Date(),
  });
  const { key } = await auth.api.createApiKey({
    body: { userId: account.user.id, name: userName },
  });
  return { account, key };
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
  const dispatcher = await keyAccount(workspace.id, "despachador", "member");
  mockAuthenticatedSession(user);
  return { app: createApp().app, user, workspace, project, dispatcher };
}

const SIGNALS = {
  calculado_en: "2026-11-05T10:00:00.000Z",
  columnas: {
    "in-progress": { media_s: 36000, tareas: 25, ambito: "proyecto" },
  },
  tareas: {
    t1: {
      alarma: null,
      espera_a: null,
      worker: {
        estado: "activo",
        instancia: "agent:coder-1",
        rol: "role:coder",
        ultima_senal: "2026-11-05T09:59:00.000Z",
        trabajando: true,
      },
    },
    t2: {
      alarma: { cuando: "2026-11-05T14:00:00.000Z", motivo: "release" },
      espera_a: "person:jaime",
      worker: null,
    },
  },
};

const path = (projectId: string) =>
  `/api/intelia/project/${projectId}/board-signals`;

function put(app: App, projectId: string, body: unknown, key?: string) {
  return app.request(path(projectId), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "x-api-key": key } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("/api/intelia/project/{projectId}/board-signals", () => {
  it("is empty until the factory writes, then returns the last write, replaced whole", async () => {
    const { app, project, dispatcher } = await setup();
    const empty = await app.request(path(project.id));
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({
      calculado_en: null,
      columnas: {},
      tareas: {},
    });

    mockAnonymousSession();
    const first = await put(app, project.id, SIGNALS, dispatcher.key);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(SIGNALS);

    const second = {
      calculado_en: "2026-11-05T10:02:00.000Z",
      columnas: {},
      tareas: { t3: { alarma: null, espera_a: "SF-9", worker: null } },
    };
    expect((await put(app, project.id, second, dispatcher.key)).status).toBe(
      200,
    );
    const read = await app.request(path(project.id), {
      headers: { "x-api-key": dispatcher.key },
    });
    expect(await read.json()).toEqual(second);
  });

  it("only an API key with task:update writes; a session or a viewer's key cannot", async () => {
    const { app, project, workspace } = await setup();
    const session = await put(app, project.id, SIGNALS);
    expect(session.status).toBe(403);
    expect(await readErrorBody(session)).toMatchObject({ code: "FORBIDDEN" });

    const viewer = await keyAccount(workspace.id, "lector", "viewer");
    mockAnonymousSession();
    const asViewer = await put(app, project.id, SIGNALS, viewer.key);
    expect(asViewer.status).toBe(403);
    expect(await readErrorBody(asViewer)).toMatchObject({
      code: "MISSING_PERMISSION",
      missingPermissions: ["task:update"],
    });
    // The viewer still reads them, like the project's tasks.
    const read = await app.request(path(project.id), {
      headers: { "x-api-key": viewer.key },
    });
    expect(read.status).toBe(200);
  });

  it("rejects malformed signals without storing them", async () => {
    const { app, project, dispatcher } = await setup();
    mockAnonymousSession();
    const bad = [
      { ...SIGNALS, calculado_en: "ayer" },
      {
        ...SIGNALS,
        tareas: {
          t1: {
            ...SIGNALS.tareas.t1,
            worker: { ...SIGNALS.tareas.t1.worker, estado: "zombi" },
          },
        },
      },
      {
        ...SIGNALS,
        columnas: { x: { media_s: -1, tareas: 1, ambito: "proyecto" } },
      },
    ];
    for (const body of bad) {
      expect((await put(app, project.id, body, dispatcher.key)).status).toBe(
        400,
      );
    }
    const read = await app.request(path(project.id), {
      headers: { "x-api-key": dispatcher.key },
    });
    expect((await read.json()).calculado_en).toBeNull();
  });

  it("answers another workspace's key like the task list does", async () => {
    const { app, project } = await setup();
    const other = await createWorkspaceMember({
      role: "owner",
      userName: "Fuera",
    });
    const stranger = await keyAccount(other.workspace.id, "otro", "member");
    mockAnonymousSession();
    const write = await put(app, project.id, SIGNALS, stranger.key);
    const tasks = await app.request(`/api/task/tasks/${project.id}`, {
      headers: { "x-api-key": stranger.key },
    });
    expect(write.status).toBe(tasks.status);
    expect(write.status).toBeGreaterThanOrEqual(403);
  });
});
