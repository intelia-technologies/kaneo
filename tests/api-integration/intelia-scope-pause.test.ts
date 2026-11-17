// Scope pauses (design 81 §4.1, PZ-03): one active pause per project or
// initiative, its history, and the read the dispatcher uses. The responses go
// through the factory's contract (PZ-01), copied in contract-samples.
import { readFileSync } from "node:fs";
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
  initiativeTable,
  scopePauseTable,
  taskInitiativeTable,
} from "../../apps/api/src/intelia/schema";
import { madridToday } from "../../apps/api/src/intelia/scope-pause/revisar-el";
import {
  traducirHistorialPausaFork,
  traducirPausaAmbitoFork,
  traducirPausasVigentesFork,
} from "./contract-samples/pausa-ambito/pausa-ambito";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

type App = ReturnType<typeof createApp>["app"];
type Json = Record<string, unknown>;

const SAMPLES = new URL("./contract-samples/pausa-ambito/", import.meta.url);
const ACTOR = "agent:forja";

let nextNumber = 1;

beforeEach(async () => {
  await resetTestDatabase();
  nextNumber = 1;
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A day N days from today in Madrid, as YYYY-MM-DD. */
function day(offset: number) {
  const date = new Date(`${madridToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function seedTask(projectId: string, title = `Tarea ${nextNumber}`) {
  const number = nextNumber++;
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      title,
      description: "",
      priority: "medium",
      status: "to-do",
      number,
      position: number,
    })
    .returning();
  if (!task) throw new Error("Failed to seed task");
  return task;
}

async function seedInitiative(projectId: string, name: string) {
  const [initiative] = await db
    .insert(initiativeTable)
    .values({ projectId, name, nameKey: name.toLowerCase(), source: "session" })
    .returning();
  if (!initiative) throw new Error("Failed to seed initiative");
  return initiative;
}

function join(taskId: string, initiativeId: string) {
  return db
    .insert(taskInitiativeTable)
    .values({ taskId, initiativeId, origin: "plan", source: "session" });
}

async function setup() {
  const { user, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Jaime",
  });
  const { project: sf } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Software Factory",
    slug: "SF",
  });
  const { project: kf } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Fork de Kaneo",
    slug: "KF",
  });
  mockAuthenticatedSession(user);
  return { app: createApp().app, user, workspace, sf, kf };
}

async function apiKeyOf(workspaceId: string, userName: string) {
  const user = await addWorkspaceMember(workspaceId, "member");
  await db
    .update(schema.userTable)
    .set({ name: userName })
    .where(eq(schema.userTable.id, user.id));
  const { key } = await auth.api.createApiKey({
    body: { userId: user.id, name: userName },
  });
  return { user, key };
}

function call(
  app: App,
  method: string,
  path: string,
  body?: Json,
  headers: Record<string, string> = {},
) {
  return app.request(`/api/intelia${path}`, {
    method,
    headers:
      body === undefined
        ? headers
        : { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function pauseProject(app: App, projectId: string, body: Json = {}) {
  return call(app, "POST", `/project/${projectId}/pause`, {
    motivo: "Esperando la decisión de alcance",
    revisarEl: day(2),
    ...body,
  });
}

function pauseInitiative(app: App, initiativeId: string, body: Json = {}) {
  return call(app, "POST", `/initiative/${initiativeId}/pause`, {
    motivo: "Iniciativa en revisión",
    revisarEl: day(3),
    ...body,
  });
}

async function listPauses(app: App, workspaceId: string, query = "") {
  const res = await call(
    app,
    "GET",
    `/workspace/${workspaceId}/scope-pauses${query}`,
  );
  expect(res.status).toBe(200);
  return (await res.json()) as { pausas: Json[]; calculadoEn: string };
}

function expectContractPause(body: unknown) {
  const read = traducirPausaAmbitoFork(body);
  expect(read).toMatchObject({ ok: true });
  return read;
}

describe("API integration: Intelia scope pauses", () => {
  it("pauses a project once: a second POST is 409 PAUSA_YA_ACTIVA with the active pause", async () => {
    const { app, sf, workspace } = await setup();

    const first = await pauseProject(app, sf.id);
    expect(first.status).toBe(201);
    const pause = (await first.json()) as Json;
    expect(pause).toMatchObject({
      workspaceId: workspace.id,
      scopeType: "project",
      projectId: sf.id,
      initiativeId: null,
      scopeName: "Software Factory",
      motivo: "Esperando la decisión de alcance",
      revisarEl: day(2),
      pausedByName: "Jaime",
      pausedByActor: null,
      resumedAt: null,
    });
    expect(pause).not.toHaveProperty("taskIds");
    expectContractPause(pause);

    const second = await pauseProject(app, sf.id, { motivo: "Otra razón" });
    expect(second.status).toBe(409);
    const conflict = (await second.json()) as Json;
    expect(conflict).toMatchObject({
      code: "PAUSA_YA_ACTIVA",
      pause: { id: pause.id, motivo: "Esperando la decisión de alcance" },
    });
    expect(await db.select().from(scopePauseTable)).toHaveLength(1);
  });

  it("keeps one active pause per scope when POSTs race", async () => {
    const { app, sf, kf } = await setup();
    const initiative = await seedInitiative(sf.id, "Pausa D81");

    const responses = await Promise.all([
      ...Array.from({ length: 6 }, () => pauseProject(app, kf.id)),
      ...Array.from({ length: 6 }, () => pauseInitiative(app, initiative.id)),
    ]);
    const statuses = responses.map((res) => res.status);
    expect(statuses.slice(0, 6).filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.slice(0, 6).filter((s) => s === 409)).toHaveLength(5);
    expect(statuses.slice(6).filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.slice(6).filter((s) => s === 409)).toHaveLength(5);

    const bodies = (await Promise.all(
      responses.map((r) => r.json()),
    )) as Json[];
    const created = bodies.filter((_, i) => statuses[i] === 201);
    for (const [i, body] of bodies.entries()) {
      if (statuses[i] !== 409) continue;
      const winner = created.find(
        (pause) => pause.scopeType === (body.pause as Json).scopeType,
      );
      expect((body.pause as Json).id).toBe(winner?.id);
    }
    expect(await db.select().from(scopePauseTable)).toHaveLength(2);
  });

  it("rejects a pause without a reason or a future review date, with the pause's codes", async () => {
    const { app, sf } = await setup();
    const cases: Array<[Json, string]> = [
      [{ motivo: undefined }, "PAUSA_MOTIVO_REQUERIDO"],
      [{ motivo: "  no " }, "PAUSA_MOTIVO_REQUERIDO"],
      [{ motivo: "x".repeat(501) }, "PAUSA_MOTIVO_REQUERIDO"],
      [{ revisarEl: undefined }, "PAUSA_REVISAR_EL_REQUERIDA"],
      [{ revisarEl: "2026-02-30" }, "PAUSA_REVISAR_EL_REQUERIDA"],
      [{ revisarEl: madridToday() }, "PAUSA_REVISAR_EL_PASADA"],
      [{ revisarEl: day(-1) }, "PAUSA_REVISAR_EL_PASADA"],
    ];
    for (const [body, code] of cases) {
      const res = await pauseProject(app, sf.id, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await readErrorBody(res)).code).toBe(code);
    }
    expect(await db.select().from(scopePauseTable)).toHaveLength(0);
  });

  it("resume is idempotent and frees the scope for a new pause", async () => {
    const { app, sf, workspace } = await setup();
    const pause = (await (await pauseProject(app, sf.id)).json()) as Json;

    const first = await call(app, "POST", `/scope-pause/${pause.id}/resume`, {
      nota: "Decidido",
    });
    expect(first.status).toBe(200);
    const resumed = (await first.json()) as Json;
    expect(resumed).toMatchObject({
      resumedByName: "Jaime",
      notaReanudar: "Decidido",
    });
    expect(resumed.resumedAt).not.toBeNull();
    expectContractPause(resumed);

    const again = await call(app, "POST", `/scope-pause/${pause.id}/resume`, {
      nota: "Otra nota",
    });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(resumed);
    // Without a body too.
    const bare = await call(app, "POST", `/scope-pause/${pause.id}/resume`);
    expect(bare.status).toBe(200);

    const history = await call(app, "GET", `/scope-pause/${pause.id}/history`);
    const kinds = ((await history.json()) as Json[]).map((c) => c.kind);
    expect(kinds).toEqual(["created", "resumed"]);

    const patch = await call(app, "PATCH", `/scope-pause/${pause.id}`, {
      motivo: "Demasiado tarde",
    });
    expect(patch.status).toBe(409);
    expect((await readErrorBody(patch)).code).toBe("PAUSA_REANUDADA");

    expect((await pauseProject(app, sf.id)).status).toBe(201);
    expect((await listPauses(app, workspace.id)).pausas).toHaveLength(1);
    expect(
      (await listPauses(app, workspace.id, "?estado=todas")).pausas,
    ).toHaveLength(2);
  });

  it("lists an initiative pause with its tasks of every project, read again on each GET", async () => {
    const { app, sf, kf, workspace } = await setup();
    const initiative = await seedInitiative(sf.id, "Pausa por iniciativa");
    const home = await seedTask(sf.id);
    const away = await seedTask(kf.id);
    const outside = await seedTask(kf.id);
    await join(home.id, initiative.id);
    await join(away.id, initiative.id);

    const res = await pauseInitiative(app, initiative.id);
    expect(res.status).toBe(201);
    const created = (await res.json()) as Json;
    expect(created).toMatchObject({
      scopeType: "initiative",
      projectId: sf.id,
      initiativeId: initiative.id,
      scopeName: "Pausa por iniciativa",
    });

    const first = await listPauses(app, workspace.id);
    expect(first.pausas).toHaveLength(1);
    expect([...(first.pausas[0]!.taskIds as string[])].sort()).toEqual(
      [home.id, away.id].sort(),
    );
    expect(first.pausas[0]!.taskIds).not.toContain(outside.id);
    const translated = traducirPausasVigentesFork(first);
    expect(translated).toMatchObject({ ok: true });

    const later = await seedTask(kf.id, "Añadida después");
    await join(later.id, initiative.id);
    const second = await listPauses(app, workspace.id);
    expect(second.pausas[0]!.taskIds).toContain(later.id);
  });

  it("filters resumed pauses with estado=todas&desde, and validates the query", async () => {
    const { app, sf, kf, workspace } = await setup();
    const old = (await (await pauseProject(app, sf.id)).json()) as Json;
    await call(app, "POST", `/scope-pause/${old.id}/resume`, {});
    await db
      .update(scopePauseTable)
      .set({ resumedAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(scopePauseTable.id, old.id as string));
    const active = (await (await pauseProject(app, kf.id)).json()) as Json;

    const recent = await listPauses(
      app,
      workspace.id,
      "?estado=todas&desde=2026-06-01",
    );
    expect(recent.pausas.map((p) => p.id)).toEqual([active.id]);
    const all = await listPauses(app, workspace.id, "?estado=todas");
    expect(all.pausas.map((p) => p.id)).toEqual([old.id, active.id]);
    expect(traducirPausasVigentesFork(all)).toMatchObject({ ok: true });

    const bad = await call(
      app,
      "GET",
      `/workspace/${workspace.id}/scope-pauses?estado=pausada`,
    );
    expect(bad.status).toBe(400);
  });

  it("keeps the history created, updated and resumed with the actor of an API key", async () => {
    const { app, sf, workspace } = await setup();
    const { user: coder, key } = await apiKeyOf(workspace.id, "coder");
    const headers = { "x-api-key": key };

    const res = await call(
      app,
      "POST",
      `/project/${sf.id}/pause`,
      { motivo: "Ensayo", revisarEl: day(1), actor: ACTOR },
      headers,
    );
    expect(res.status).toBe(201);
    const pause = (await res.json()) as Json;
    expect(pause).toMatchObject({
      pausedByUserId: coder.id,
      pausedByActor: ACTOR,
    });

    const updated = await call(
      app,
      "PATCH",
      `/scope-pause/${pause.id}`,
      { motivo: "Ensayo del diseño 81", revisarEl: day(4), actor: ACTOR },
      headers,
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      motivo: "Ensayo del diseño 81",
      revisarEl: day(4),
    });
    // A PATCH that changes nothing leaves no row.
    await call(
      app,
      "PATCH",
      `/scope-pause/${pause.id}`,
      { motivo: "Ensayo del diseño 81", actor: ACTOR },
      headers,
    );
    // A session resumes, with no actor.
    await call(app, "POST", `/scope-pause/${pause.id}/resume`, {
      nota: "Listo",
    });

    const historyRes = await call(
      app,
      "GET",
      `/scope-pause/${pause.id}/history`,
    );
    expect(historyRes.status).toBe(200);
    const history = (await historyRes.json()) as Json[];
    expect(history).toMatchObject([
      {
        kind: "created",
        previous: null,
        value: { motivo: "Ensayo", revisarEl: day(1) },
        userId: coder.id,
        actor: ACTOR,
        source: "api_key",
      },
      {
        kind: "updated",
        previous: { motivo: "Ensayo", revisarEl: day(1) },
        value: { motivo: "Ensayo del diseño 81", revisarEl: day(4) },
        userId: coder.id,
        actor: ACTOR,
        source: "api_key",
      },
      {
        kind: "resumed",
        previous: { resumedAt: null },
        value: { notaReanudar: "Listo" },
        userName: "Jaime",
        actor: null,
        source: "session",
      },
    ]);
    const translated = traducirHistorialPausaFork(history);
    expect(translated).toMatchObject({ ok: true });
    if (translated.ok) {
      expect(translated.valor.map((c) => c.tipo)).toEqual([
        "creada",
        "cambiada",
        "reanudada",
      ]);
    }
  });

  it("rejects `actor` from a session, and writes without task:update", async () => {
    const { app, sf, workspace } = await setup();
    const sessionActor = await pauseProject(app, sf.id, { actor: ACTOR });
    expect(sessionActor.status).toBe(400);

    const viewer = await addWorkspaceMember(workspace.id, "viewer");
    vi.restoreAllMocks();
    mockAuthenticatedSession(viewer);
    expect((await pauseProject(app, sf.id)).status).toBe(403);
    expect(await db.select().from(scopePauseTable)).toHaveLength(0);
  });

  it("shows a restricted member only the pauses and tasks of the projects it can read", async () => {
    const { app, sf, kf, workspace } = await setup();
    const initiative = await seedInitiative(sf.id, "Mixta");
    const home = await seedTask(sf.id);
    const away = await seedTask(kf.id);
    await join(home.id, initiative.id);
    await join(away.id, initiative.id);
    const kfPause = (await (await pauseProject(app, kf.id)).json()) as Json;
    await pauseInitiative(app, initiative.id);

    const member = await addWorkspaceMember(workspace.id, "member");
    await restrictToProjects(workspace.id, member.id, [sf.id]);
    vi.restoreAllMocks();
    mockAuthenticatedSession(member);

    const { pausas } = await listPauses(app, workspace.id);
    expect(pausas).toHaveLength(1);
    expect(pausas[0]).toMatchObject({
      scopeType: "initiative",
      taskIds: [home.id],
    });
    const history = await call(
      app,
      "GET",
      `/scope-pause/${kfPause.id}/history`,
    );
    expect(history.status).toBe(403);
  });

  it("does not show another workspace's pauses", async () => {
    const { app, sf } = await setup();
    await pauseProject(app, sf.id);
    const other = await createWorkspaceMember({ role: "owner" });
    vi.restoreAllMocks();
    mockAuthenticatedSession(other.user);
    expect((await listPauses(app, other.workspace.id)).pausas).toEqual([]);
  });

  it("answers the GET in under 300 ms with 1,600 tasks and 50 pauses", async () => {
    const { app, user, workspace } = await setup();
    const projects: Array<{ id: string }> = [];
    for (let i = 0; i < 10; i++) {
      const { project } = await createProjectFixture({
        workspaceId: workspace.id,
        name: `Proyecto ${i}`,
      });
      projects.push(project);
    }
    const initiatives = await db
      .insert(initiativeTable)
      .values(
        Array.from({ length: 40 }, (_, i) => ({
          projectId: projects[i % 10]!.id,
          name: `Iniciativa ${i}`,
          nameKey: `iniciativa ${i}`,
          source: "session" as const,
        })),
      )
      .returning();
    const tasks = await db
      .insert(schema.taskTable)
      .values(
        Array.from({ length: 1600 }, (_, i) => ({
          projectId: projects[i % 10]!.id,
          title: `Tarea ${i}`,
          description: "",
          priority: "medium",
          status: "to-do",
          number: i + 1,
          position: i + 1,
        })),
      )
      .returning({ id: schema.taskTable.id });
    await db.insert(taskInitiativeTable).values(
      tasks.map((task, i) => ({
        taskId: task.id,
        initiativeId: initiatives[i % 40]!.id,
        origin: "plan" as const,
        source: "session" as const,
      })),
    );
    await db.insert(scopePauseTable).values([
      ...projects.map((project) => ({
        workspaceId: workspace.id,
        scopeType: "project" as const,
        projectId: project.id,
        motivo: "Carga",
        revisarEl: day(1),
        pausedByUserId: user.id,
      })),
      ...initiatives.map((initiative) => ({
        workspaceId: workspace.id,
        scopeType: "initiative" as const,
        initiativeId: initiative.id,
        motivo: "Carga",
        revisarEl: day(1),
        pausedByUserId: user.id,
      })),
    ]);

    await listPauses(app, workspace.id);
    const started = performance.now();
    const { pausas } = await listPauses(app, workspace.id);
    const elapsed = performance.now() - started;

    expect(pausas).toHaveLength(50);
    expect(
      pausas.reduce(
        (sum, pause) => sum + ((pause.taskIds as string[]) ?? []).length,
        0,
      ),
    ).toBe(1600);
    expect(elapsed).toBeLessThan(300);
  });

  it("keeps the copied contract samples readable by the contract", () => {
    const read = (name: string) =>
      JSON.parse(readFileSync(new URL(name, SAMPLES), "utf8")) as Json;
    expect(
      traducirPausasVigentesFork(read("pausa-proyecto.json").respuesta),
    ).toMatchObject({ ok: true });
    expect(
      traducirPausasVigentesFork(read("pausa-iniciativa.json").respuesta),
    ).toMatchObject({ ok: true });
    expect(
      traducirPausasVigentesFork(read("pausa-reanudada.json").respuesta),
    ).toMatchObject({ ok: true });
    expect(
      traducirHistorialPausaFork(read("historial.json").respuesta),
    ).toMatchObject({ ok: true });
  });
});
