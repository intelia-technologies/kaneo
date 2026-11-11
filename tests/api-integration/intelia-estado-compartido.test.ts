// `estado_compartido` on initiatives and tasks (annex of design 33 §4.1,
// CJ-14): the CJ-13 sample goes in and comes back unchanged, values outside
// the contract's fields are refused, and only writers may change it.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import {
  initiativeChangeTable,
  initiativeTable,
} from "../../apps/api/src/intelia/schema";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { parse } from "yaml";

// The CJ-13 sample, byte for byte: software-factory
// testing/contratos/muestras/cadena/lab-h2.estado.yml at commit
// 44eb441dad8d4c0d0a09aa4288074b5d026dcffa (PR #1675), git blob
// 97385b62d070642d878eb0d03f2b09b4989c6aef. Check with
// `git hash-object tests/api-integration/contract-samples/cadena-lab-h2.estado.yml`
// here and `git rev-parse 44eb441d:testing/contratos/muestras/cadena/lab-h2.estado.yml`
// in software-factory.
const LAB_H2_BLOB = "97385b62d070642d878eb0d03f2b09b4989c6aef";
const LAB_H2_SOURCE = readFileSync(
  new URL("./contract-samples/cadena-lab-h2.estado.yml", import.meta.url),
);
const LAB_H2 = parse(LAB_H2_SOURCE.toString("utf8")) as Record<string, unknown>;

function gitBlobId(content: Buffer) {
  return createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}

const INVALID = [
  { ...LAB_H2, semilla: "dump.sql" },
  { ...LAB_H2, nombre: "Lab H2" },
  { ...LAB_H2, datos: "clientes" },
  { ...LAB_H2, tamano_max_gb: 0 },
  { ...LAB_H2, tamano_max_gb: 2.5 },
  { ...LAB_H2, servicios: "   " },
  { ...LAB_H2, ficheros: false, servicios: null },
  "lab-h2",
];

it("uses the CJ-13 sample unchanged", () => {
  expect(gitBlobId(LAB_H2_SOURCE)).toBe(LAB_H2_BLOB);
  expect(Object.keys(LAB_H2).sort()).toEqual([
    "datos",
    "ficheros",
    "nombre",
    "servicios",
    "tamano_max_gb",
  ]);
});

const json = { "content-type": "application/json" };

type App = ReturnType<typeof createApp>["app"];

beforeEach(async () => {
  await resetTestDatabase();
  vi.restoreAllMocks();
});

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
  return key;
}

async function setup() {
  const { user, workspace } = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: workspace.id,
  });
  const keys = {
    member: await keyAccount(workspace.id, "coder", "member"),
    viewer: await keyAccount(workspace.id, "viewer", "viewer"),
    readOnly: await keyAccount(workspace.id, "reader", "member", {
      task: ["read"],
    }),
  };
  mockAuthenticatedSession(user);
  return { app: createApp().app, user, project, keys };
}

function send(
  app: App,
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(path, {
    method,
    headers: { ...json, ...headers },
    body: JSON.stringify(body),
  });
}

async function readJson(app: App, path: string) {
  const response = await app.request(path);
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

async function storedInitiative(id: string) {
  const [row] = await db
    .select({ estado_compartido: initiativeTable.estado_compartido })
    .from(initiativeTable)
    .where(eq(initiativeTable.id, id));
  return row?.estado_compartido;
}

async function storedTask(id: string) {
  const row = await db.query.taskTable.findFirst({
    where: eq(schema.taskTable.id, id),
  });
  return row?.estado_compartido;
}

function changeCount(initiativeId: string) {
  return db.$count(
    initiativeChangeTable,
    eq(initiativeChangeTable.initiativeId, initiativeId),
  );
}

describe("estado_compartido on initiatives", () => {
  it("stores the CJ-13 sample and reads it back unchanged, keeps it when omitted and clears it with null", async () => {
    const { app, project } = await setup();
    const created = await send(
      app,
      "POST",
      `/api/intelia/project/${project.id}/initiatives`,
      { name: "Laboratorio", estado_compartido: LAB_H2 },
    );
    expect(created.status).toBe(201);
    const initiative = (await created.json()) as Record<string, unknown> & {
      id: string;
    };
    expect(initiative.estado_compartido).toStrictEqual(LAB_H2);
    expect(await storedInitiative(initiative.id)).toStrictEqual(LAB_H2);
    expect(
      (await readJson(app, `/api/intelia/initiative/${initiative.id}`))
        .estado_compartido,
    ).toStrictEqual(LAB_H2);
    expect(
      await readJson(app, `/api/intelia/project/${project.id}/initiatives`),
    ).toMatchObject({ initiatives: [{ estado_compartido: LAB_H2 }] });

    const path = `/api/intelia/initiative/${initiative.id}`;
    const changes = await changeCount(initiative.id);
    // jsonb reorders keys: the same value again is not a change.
    expect(
      (await send(app, "PATCH", path, { estado_compartido: LAB_H2 })).status,
    ).toBe(200);
    const renamed = await send(app, "PATCH", path, { name: "Lab 2" });
    expect(await renamed.json()).toMatchObject({
      name: "Lab 2",
      estado_compartido: LAB_H2,
    });
    expect(await changeCount(initiative.id)).toBe(changes + 1);

    const cleared = await send(app, "PATCH", path, { estado_compartido: null });
    expect(await cleared.json()).toMatchObject({ estado_compartido: null });
    expect(await storedInitiative(initiative.id)).toBeNull();
    const [last] = await db
      .select()
      .from(initiativeChangeTable)
      .where(eq(initiativeChangeTable.initiativeId, initiative.id))
      .orderBy(initiativeChangeTable.changedAt)
      .limit(1)
      .offset(changes + 1);
    expect(last).toMatchObject({
      kind: "updated",
      previous: { estado_compartido: LAB_H2 },
      value: { estado_compartido: null },
    });
  });

  it("refuses values outside the contract, on create and on edit, changing nothing", async () => {
    const { app, project } = await setup();
    for (const estado_compartido of INVALID) {
      expect(
        (
          await send(
            app,
            "POST",
            `/api/intelia/project/${project.id}/initiatives`,
            { name: "Inválida", estado_compartido },
          )
        ).status,
        JSON.stringify(estado_compartido),
      ).toBe(400);
    }
    expect(await db.$count(initiativeTable)).toBe(0);

    const created = (await (
      await send(
        app,
        "POST",
        `/api/intelia/project/${project.id}/initiatives`,
        {
          name: "Laboratorio",
          estado_compartido: LAB_H2,
        },
      )
    ).json()) as { id: string };
    for (const estado_compartido of INVALID) {
      expect(
        (
          await send(app, "PATCH", `/api/intelia/initiative/${created.id}`, {
            estado_compartido,
          })
        ).status,
        JSON.stringify(estado_compartido),
      ).toBe(400);
    }
    expect(await storedInitiative(created.id)).toStrictEqual(LAB_H2);
  });

  it("lets only writers change it: a viewer or a read-only key gets 403 and nothing changes", async () => {
    const { app, project, user, keys } = await setup();
    const created = (await (
      await send(
        app,
        "POST",
        `/api/intelia/project/${project.id}/initiatives`,
        {
          name: "Laboratorio",
        },
      )
    ).json()) as { id: string };
    const path = `/api/intelia/initiative/${created.id}`;

    vi.restoreAllMocks();
    mockAnonymousSession();
    expect(
      (await send(app, "PATCH", path, { estado_compartido: LAB_H2 })).status,
    ).toBe(401);
    for (const key of [keys.viewer, keys.readOnly]) {
      expect(
        (
          await send(
            app,
            "PATCH",
            path,
            { estado_compartido: LAB_H2 },
            { "x-api-key": key },
          )
        ).status,
      ).toBe(403);
    }
    expect(await storedInitiative(created.id)).toBeNull();

    const written = await send(
      app,
      "PATCH",
      path,
      { estado_compartido: LAB_H2, actor: "agent:forja" },
      { "x-api-key": keys.member },
    );
    expect(written.status).toBe(200);
    expect(await storedInitiative(created.id)).toStrictEqual(LAB_H2);
    vi.restoreAllMocks();
    mockAuthenticatedSession(user);
  });
});

describe("estado_compartido on tasks", () => {
  const base = {
    title: "Raíz de la cadena",
    description: "",
    priority: "low",
    status: "to-do",
    type: "diseno",
  };

  it("stores the CJ-13 sample on create, reads it back unchanged, keeps it when omitted and sets or clears it on its own", async () => {
    const { app, project } = await setup();
    const created = await send(app, "POST", `/api/task/${project.id}`, {
      ...base,
      estado_compartido: LAB_H2,
    });
    expect(created.status).toBe(200);
    const task = (await created.json()) as Record<string, unknown> & {
      id: string;
      position: number;
    };
    expect(task.estado_compartido).toStrictEqual(LAB_H2);
    expect(await storedTask(task.id)).toStrictEqual(LAB_H2);
    expect(
      (await readJson(app, `/api/task/${task.id}`)).estado_compartido,
    ).toStrictEqual(LAB_H2);

    const update = (extra: Record<string, unknown>) =>
      send(app, "PUT", `/api/task/${task.id}`, {
        ...base,
        projectId: project.id,
        position: task.position,
        ...extra,
      });
    expect(await (await update({ title: "Otra" })).json()).toMatchObject({
      title: "Otra",
      estado_compartido: LAB_H2,
    });
    expect(
      await (await update({ estado_compartido: null })).json(),
    ).toMatchObject({ estado_compartido: null });
    expect(await storedTask(task.id)).toBeNull();

    const dedicated = `/api/task/estado_compartido/${task.id}`;
    const set = await send(app, "PUT", dedicated, {
      estado_compartido: LAB_H2,
    });
    expect(set.status).toBe(200);
    expect(await set.json()).toMatchObject({ estado_compartido: LAB_H2 });
    expect(
      (await readJson(app, `/api/task/${task.id}`)).estado_compartido,
    ).toStrictEqual(LAB_H2);
    const clear = await send(app, "PUT", dedicated, {
      estado_compartido: null,
    });
    expect(await clear.json()).toMatchObject({ estado_compartido: null });
    expect(
      (
        await send(app, "PUT", "/api/task/estado_compartido/missing", {
          estado_compartido: LAB_H2,
        })
      ).status,
    ).toBe(404);
  });

  it("refuses values outside the contract on create, update and the dedicated route", async () => {
    const { app, project } = await setup();
    const created = (await (
      await send(app, "POST", `/api/task/${project.id}`, {
        ...base,
        estado_compartido: LAB_H2,
      })
    ).json()) as { id: string; position: number };
    const tasks = await db.$count(schema.taskTable);
    for (const estado_compartido of INVALID) {
      const label = JSON.stringify(estado_compartido);
      expect(
        (
          await send(app, "POST", `/api/task/${project.id}`, {
            ...base,
            estado_compartido,
          })
        ).status,
        label,
      ).toBe(400);
      expect(
        (
          await send(app, "PUT", `/api/task/${created.id}`, {
            ...base,
            projectId: project.id,
            position: created.position,
            estado_compartido,
          })
        ).status,
        label,
      ).toBe(400);
      expect(
        (
          await send(app, "PUT", `/api/task/estado_compartido/${created.id}`, {
            estado_compartido,
          })
        ).status,
        label,
      ).toBe(400);
    }
    expect(await db.$count(schema.taskTable)).toBe(tasks);
    expect(await storedTask(created.id)).toStrictEqual(LAB_H2);
  });

  it("lets only task:update change it: a viewer or a read-only key gets 403 and nothing changes", async () => {
    const { app, project, user, keys } = await setup();
    const created = (await (
      await send(app, "POST", `/api/task/${project.id}`, base)
    ).json()) as { id: string; position: number };

    vi.restoreAllMocks();
    mockAnonymousSession();
    for (const key of [keys.viewer, keys.readOnly]) {
      const headers = { "x-api-key": key };
      expect(
        (
          await send(
            app,
            "PUT",
            `/api/task/estado_compartido/${created.id}`,
            { estado_compartido: LAB_H2 },
            headers,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await send(
            app,
            "PUT",
            `/api/task/${created.id}`,
            {
              ...base,
              projectId: project.id,
              position: created.position,
              estado_compartido: LAB_H2,
            },
            headers,
          )
        ).status,
      ).toBe(403);
    }
    expect(await storedTask(created.id)).toBeNull();

    const written = await send(
      app,
      "PUT",
      `/api/task/estado_compartido/${created.id}`,
      { estado_compartido: LAB_H2 },
      { "x-api-key": keys.member },
    );
    expect(written.status).toBe(200);
    expect(await storedTask(created.id)).toStrictEqual(LAB_H2);
    vi.restoreAllMocks();
    mockAuthenticatedSession(user);
  });
});
