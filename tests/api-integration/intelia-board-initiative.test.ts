// The board returns each task's initiative (KF-23) for the list's
// «Iniciativa» column: in its own statement, never one query per task. An
// initiative of another project shows its name, unless the reader cannot read
// that project (design 52 §3.1); a public board only shows public ones.
import { eq } from "drizzle-orm";
import { Client } from "pg";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
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
type Initiative = { id: string; projectId: string; name: string | null };
type BoardTask = { id: string; initiative: Initiative | null };
type BoardData = {
  columns: Array<{ tasks: BoardTask[] }>;
  archivedTasks: BoardTask[];
  plannedTasks: BoardTask[];
};

let nextNumber = 1;

beforeEach(async () => {
  await resetTestDatabase();
  nextNumber = 1;
  vi.restoreAllMocks();
});

async function seedTask(projectId: string, status = "to-do") {
  const number = nextNumber++;
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      title: `Tarea ${number}`,
      description: "",
      status,
      number,
      position: number,
    })
    .returning();
  return task!;
}

async function seedInitiative(projectId: string, name: string) {
  const [initiative] = await db
    .insert(initiativeTable)
    .values({ projectId, name, nameKey: name.toLowerCase(), source: "session" })
    .returning();
  return initiative!;
}

function join(taskId: string, initiativeId: string) {
  return db
    .insert(taskInitiativeTable)
    .values({ taskId, initiativeId, origin: "plan", source: "session" });
}

function byTask(data: BoardData) {
  return Object.fromEntries(
    [
      ...data.columns.flatMap((column) => column.tasks),
      ...data.plannedTasks,
      ...data.archivedTasks,
    ].map((task) => [task.id, task.initiative]),
  );
}

async function board(app: App, projectId: string) {
  const response = await app.request(`/api/task/tasks/${projectId}?limit=100`);
  expect(response.status).toBe(200);
  return byTask(((await response.json()) as { data: BoardData }).data);
}

// SF holds «Tableros»; INFRA holds «Puertos». `reader` only reads SF.
async function setup() {
  const { user, workspace } = await createWorkspaceMember({ role: "owner" });
  const { project: sf } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Software Factory",
    slug: "SF",
  });
  const { project: infra } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Infraestructura",
    slug: "INFRA",
  });
  const tableros = await seedInitiative(sf.id, "Tableros");
  const puertos = await seedInitiative(infra.id, "Puertos");
  const reader = await addWorkspaceMember(workspace.id, "member");
  await restrictToProjects(workspace.id, reader.id, [sf.id]);
  mockAuthenticatedSession(user);
  return { app: createApp().app, user, sf, infra, tableros, puertos, reader };
}

describe("GET /api/task/tasks/{projectId} initiative", () => {
  it("returns the initiative of the tasks of every status, null without one, and names one of another project", async () => {
    const { app, sf, tableros, puertos } = await setup();
    const todo = await seedTask(sf.id, "to-do");
    const doing = await seedTask(sf.id, "in-progress");
    const done = await seedTask(sf.id, "done");
    const planned = await seedTask(sf.id, "planned");
    const loose = await seedTask(sf.id, "to-do");
    await join(todo.id, tableros.id);
    await join(doing.id, puertos.id);
    await join(done.id, tableros.id);
    await join(planned.id, tableros.id);

    const own = { id: tableros.id, projectId: sf.id, name: "Tableros" };
    expect(await board(app, sf.id)).toEqual({
      [todo.id]: own,
      [doing.id]: {
        id: puertos.id,
        projectId: puertos.projectId,
        name: "Puertos",
      },
      [done.id]: own,
      [planned.id]: own,
      [loose.id]: null,
    });
  });

  it("hides the name of an initiative of a project the reader cannot read", async () => {
    const { app, sf, puertos, reader } = await setup();
    const task = await seedTask(sf.id);
    await join(task.id, puertos.id);
    mockAuthenticatedSession(reader);
    expect(await board(app, sf.id)).toEqual({
      [task.id]: { id: puertos.id, projectId: puertos.projectId, name: null },
    });
  });

  it("shows on a public board only initiatives of public projects", async () => {
    const { app, sf, infra, tableros, puertos } = await setup();
    await db
      .update(schema.projectTable)
      .set({ isPublic: true })
      .where(eq(schema.projectTable.id, sf.id));
    const own = await seedTask(sf.id);
    const other = await seedTask(sf.id);
    await join(own.id, tableros.id);
    await join(other.id, puertos.id);
    mockAnonymousSession();

    const read = async () => {
      const response = await app.request(`/api/public-project/${sf.id}`);
      expect(response.status).toBe(200);
      return byTask((await response.json()) as BoardData);
    };
    expect(await read()).toEqual({
      [own.id]: { id: tableros.id, projectId: sf.id, name: "Tableros" },
      [other.id]: null,
    });

    await db
      .update(schema.projectTable)
      .set({ isPublic: true })
      .where(eq(schema.projectTable.id, infra.id));
    expect((await read())[other.id]).toEqual({
      id: puertos.id,
      projectId: infra.id,
      name: "Puertos",
    });
  });

  it("issues the same statements with and without initiatives, for one task as for 150", async () => {
    const { app, sf, tableros } = await setup();
    await seedTask(sf.id);
    const query = vi.spyOn(Client.prototype, "query");
    await board(app, sf.id);
    const before = query.mock.calls.length;
    expect(before).toBeGreaterThan(0);

    for (let i = 0; i < 149; i++) {
      const task = await seedTask(sf.id);
      await join(task.id, tableros.id);
    }
    query.mockClear();
    const response = await app.request(`/api/task/tasks/${sf.id}?limit=100`);
    expect(response.status).toBe(200);
    expect(query.mock.calls.length).toBe(before);
  });
});

describe("GET /api/task/{id}?view=board initiative", () => {
  it("returns the initiative, so a task patched into the board keeps its cell", async () => {
    const { app, sf, puertos } = await setup();
    const task = await seedTask(sf.id);
    await join(task.id, puertos.id);
    const response = await app.request(`/api/task/${task.id}?view=board`);
    expect(response.status).toBe(200);
    expect(((await response.json()) as BoardTask).initiative).toEqual({
      id: puertos.id,
      projectId: puertos.projectId,
      name: "Puertos",
    });
  });
});
