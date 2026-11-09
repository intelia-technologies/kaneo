import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { asc, eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
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
  priorityChangeListSchema,
  projectPrioritiesSchema,
} from "../../apps/api/src/intelia/priorities/response";
import { priorityTable } from "../../apps/api/src/intelia/schema";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];
type Body = Record<string, unknown>;
type Delivery = {
  body: Body & { data: Body; priority: Body };
  signed: boolean;
};

const SECRET = "priority-webhook-secret";
const SAMPLES = new URL("./contract-samples/", import.meta.url);

// A real receiver: the events go through upstream's generic webhook client,
// signature included. `/priorities` is the workspace's priority destination;
// `/project` is every project's own generic webhook, which must get nothing.
let server: Server;
let webhookUrl: string;
let projectWebhookUrl: string;
let deliveries: Delivery[] = [];
let projectHits = 0;
const previousAllowPrivate =
  process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;

beforeAll(async () => {
  process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = "true";
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (req.url !== "/priorities") {
        projectHits += 1;
        res.writeHead(200).end("ok");
        return;
      }
      const expected = createHmac("sha256", SECRET).update(raw).digest("hex");
      deliveries.push({
        body: JSON.parse(raw),
        signed: req.headers["x-kaneo-signature"] === expected,
      });
      res.writeHead(200).end("ok");
    });
  });
  const listening = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", listening.resolve);
  await listening.promise;
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  webhookUrl = `${base}/priorities`;
  projectWebhookUrl = `${base}/project`;
});

afterAll(async () => {
  process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = previousAllowPrivate;
  const closed = Promise.withResolvers<void>();
  server.close(() => closed.resolve());
  await closed.promise;
});

beforeEach(async () => {
  await resetTestDatabase();
  vi.restoreAllMocks();
  deliveries = [];
  projectHits = 0;
});

// Events leave after the commit without holding the request, so a test can
// only prove "no more events" by waiting a short real window: there is no
// signal for an event that is never sent.
async function quietWindow() {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 150);
  await promise;
}

async function waitForDeliveries(count: number) {
  await vi.waitFor(
    () => expect(deliveries.length).toBeGreaterThanOrEqual(count),
    {
      timeout: 5000,
      interval: 20,
    },
  );
  await quietWindow();
  return deliveries;
}

async function addMember(
  workspaceId: string,
  role: "member" | "admin",
  userName: string,
) {
  const { user } = await createWorkspaceMember({ userName });
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user.id,
    role,
    joinedAt: new Date(),
  });
  return user;
}

async function setup() {
  const { user: admin, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Jaime",
    workspaceName: "Galaxia",
  });
  const { project: build } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Construcción",
    slug: "build",
  });
  const { project: ops } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Operación",
    slug: "ops",
  });
  const { project: other } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Otro",
    slug: "other",
  });
  // Every project keeps its own generic webhook, sending every task event:
  // none of them may receive priorities.
  for (const project of [build, ops, other]) {
    await db.insert(schema.integrationTable).values({
      projectId: project.id,
      type: "generic-webhook",
      isActive: true,
      config: JSON.stringify({ webhookUrl: projectWebhookUrl, secret: SECRET }),
    });
  }
  const member = await addMember(workspace.id, "member", "Coder");
  mockAuthenticatedSession(admin);
  const app = createApp().app;
  const registered = await send(
    app,
    "POST",
    `/workspace/${workspace.id}/priority-webhooks`,
    { url: webhookUrl, secret: SECRET },
  );
  expect(registered.status).toBe(201);
  return { app, admin, member, workspace, build, ops, other };
}

function send(app: App, method: string, path: string, body?: unknown) {
  return app.request(`/api/intelia${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createPriority(app: App, workspaceId: string, body: Body) {
  const res = await send(
    app,
    "POST",
    `/workspace/${workspaceId}/priorities`,
    body,
  );
  expect(res.status).toBe(201);
  return (await res.json()) as Body & { id: string };
}

async function patch(app: App, id: string, body: Body) {
  return send(app, "PATCH", `/priority/${id}`, body);
}

async function workspaceTree(app: App, workspaceId: string) {
  const res = await send(app, "GET", `/workspace/${workspaceId}/priorities`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { priorities: Body[] }).priorities;
}

async function boardPriorities(app: App, projectId: string) {
  const res = await send(app, "GET", `/project/${projectId}/priorities`);
  expect(res.status).toBe(200);
  return (await res.json()) as {
    priorities: (Body & { chain: Body[]; projects: Body[] })[];
  };
}

describe("priorities", () => {
  it("lets an administrator build, reorder and edit the tree, with history and one event per change", async () => {
    const { app, admin, workspace, build, ops } = await setup();

    const root = await createPriority(app, workspace.id, {
      title: "Factory v1",
      body: "No nos bloqueamos",
    });
    const child = await createPriority(app, workspace.id, {
      title: "Software Factory",
      parentId: root.id,
      projectIds: [ops.id, build.id, build.id],
    });
    expect(child).toMatchObject({
      parentId: root.id,
      position: 0,
      status: "active",
      chain: [{ id: root.id, title: "Factory v1" }],
    });
    expect((child.projects as Body[]).map((p) => p.id).sort()).toEqual(
      [build.id, ops.id].sort(),
    );

    // A second child before the first: the first moves one place.
    const second = await createPriority(app, workspace.id, {
      title: "Intelia",
      parentId: root.id,
      position: 0,
    });
    expect(second.position).toBe(0);

    // Reorder: the first child back to the front.
    const reordered = await patch(app, child.id, { position: 0 });
    expect(reordered.status).toBe(200);
    expect(await reordered.json()).toMatchObject({ position: 0 });

    // Edit title and text in one change.
    const edited = await patch(app, child.id, {
      title: "Software Factory (SF)",
      body: "Archivar a las 24 h",
    });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({
      title: "Software Factory (SF)",
      body: "Archivar a las 24 h",
    });

    const rows = await db
      .select({ id: priorityTable.id, position: priorityTable.position })
      .from(priorityTable)
      .where(eq(priorityTable.parentId, root.id))
      .orderBy(asc(priorityTable.position));
    expect(rows).toEqual([
      { id: child.id, position: 0 },
      { id: second.id, position: 1 },
    ]);

    // A request that changes nothing writes and sends nothing.
    const same = await patch(app, child.id, { title: "Software Factory (SF)" });
    expect(same.status).toBe(200);

    const history = await send(app, "GET", `/priority/${child.id}/history`);
    expect(history.status).toBe(200);
    const { changes } = priorityChangeListSchema.parse(
      reviveDates(await history.json()),
    );
    expect(changes.map((c) => c.kind)).toEqual([
      "updated",
      "updated",
      "created",
    ]);
    expect(changes[0]).toMatchObject({
      changedByUserId: admin.id,
      changedByName: "Jaime",
      source: "session",
      previous: { title: "Software Factory", body: "" },
      value: { title: "Software Factory (SF)", body: "Archivar a las 24 h" },
    });
    expect(changes[1]).toMatchObject({
      previous: { position: 1 },
      value: { position: 0 },
    });
    expect(changes[2]).toMatchObject({
      previous: null,
      value: {
        title: "Software Factory",
        parentId: root.id,
        position: 0,
        projectIds: [build.id, ops.id].sort(),
      },
    });

    // root, child, second, reorder, edit: five changes, five events, only to
    // the workspace's priority destination; the projects' webhooks get none.
    const events = await waitForDeliveries(5);
    expect(events).toHaveLength(5);
    expect(projectHits).toBe(0);
    expect(events.every((d) => d.signed)).toBe(true);
    expect(events.map((d) => d.body.event)).toEqual(
      Array(5).fill("intelia.priority_changed"),
    );
    const last = events.find(
      (d) =>
        d.body.data.value &&
        (d.body.data.value as Body).body === "Archivar a las 24 h",
    );
    expect(last?.body).toMatchObject({
      workspace: { id: workspace.id, name: "Galaxia" },
      actor: { id: admin.id, name: "Jaime" },
      priority: {
        id: child.id,
        title: "Software Factory (SF)",
        projectIds: [build.id, ops.id].sort(),
        chain: [{ id: root.id, title: "Factory v1" }],
      },
      data: { kind: "updated", changeId: changes[0]?.id },
    });
    // The root's change reaches the projects that hang from it.
    const rootCreated = events.find((d) => d.body.priority.id === root.id);
    expect(rootCreated?.body.data.affectedProjectIds).toEqual([]);
    const childEvent = events.find(
      (d) => d.body.priority.id === child.id && d.body.data.kind === "created",
    );
    expect(childEvent?.body.data.affectedProjectIds).toEqual(
      [build.id, ops.id].sort(),
    );
  });

  it("tells the root's later changes to the projects of its descendants, and an unlink to the project it leaves", async () => {
    const { app, workspace, build, ops } = await setup();
    const root = await createPriority(app, workspace.id, { title: "Raíz" });
    const child = await createPriority(app, workspace.id, {
      title: "Hija",
      parentId: root.id,
      projectIds: [build.id],
    });
    await waitForDeliveries(2);
    deliveries = [];
    expect((await patch(app, root.id, { body: "Texto nuevo" })).status).toBe(
      200,
    );
    const [event] = await waitForDeliveries(1);
    expect(event?.body.data.affectedProjectIds).toEqual([build.id]);

    deliveries = [];
    expect((await patch(app, child.id, { projectIds: [ops.id] })).status).toBe(
      200,
    );
    const [moved] = await waitForDeliveries(1);
    expect(moved?.body.data.affectedProjectIds).toEqual(
      [build.id, ops.id].sort(),
    );
  });

  it("lets a member read but not edit", async () => {
    const { app, member, workspace, build } = await setup();
    const root = await createPriority(app, workspace.id, { title: "Raíz" });
    await waitForDeliveries(1);
    deliveries = [];

    vi.restoreAllMocks();
    mockAuthenticatedSession(member);
    expect(await workspaceTree(app, workspace.id)).toHaveLength(1);
    expect((await send(app, "GET", `/priority/${root.id}`)).status).toBe(200);
    expect(
      (await send(app, "GET", `/priority/${root.id}/history`)).status,
    ).toBe(200);

    const created = await send(
      app,
      "POST",
      `/workspace/${workspace.id}/priorities`,
      {
        title: "Mía",
      },
    );
    expect(created.status).toBe(403);
    const edited = await patch(app, root.id, { title: "Cambiada" });
    expect(edited.status).toBe(403);
    const linked = await patch(app, root.id, { projectIds: [build.id] });
    expect(linked.status).toBe(403);

    const [row] = await db
      .select({ title: priorityTable.title })
      .from(priorityTable)
      .where(eq(priorityTable.id, root.id));
    expect(row?.title).toBe("Raíz");
    await quietWindow();
    expect(deliveries).toHaveLength(0);
  });

  it("rejects an API key without the administrator's scope", async () => {
    const { app, admin, workspace } = await setup();
    const { key } = await auth.api.createApiKey({
      body: {
        userId: admin.id,
        name: "lectura",
        permissions: { workspace: ["read"] },
      },
    });
    vi.restoreAllMocks();
    const res = await app.request(
      `/api/intelia/workspace/${workspace.id}/priorities`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ title: "Por clave" }),
      },
    );
    expect(res.status).toBe(403);
    const read = await app.request(
      `/api/intelia/workspace/${workspace.id}/priorities`,
      { headers: { authorization: `Bearer ${key}` } },
    );
    expect(read.status).toBe(200);
  });

  it("shows each linked board its priority with the chain to the root, and an unlinked one only in the workspace", async () => {
    const { app, workspace, build, ops, other } = await setup();
    const root = await createPriority(app, workspace.id, { title: "Raíz" });
    const middle = await createPriority(app, workspace.id, {
      title: "Sistema",
      parentId: root.id,
    });
    const leaf = await createPriority(app, workspace.id, {
      title: "Hoja",
      parentId: middle.id,
      projectIds: [build.id, ops.id],
    });
    const lonely = await createPriority(app, workspace.id, {
      title: "Sin enlaces",
    });

    for (const project of [build, ops]) {
      const board = projectPrioritiesSchema.parse(
        reviveDates(await boardPriorities(app, project.id)),
      );
      expect(board.priorities.map((p) => p.id)).toEqual([leaf.id]);
      expect(board.priorities[0]?.chain.map((a) => a.title)).toEqual([
        "Raíz",
        "Sistema",
      ]);
    }
    expect((await boardPriorities(app, other.id)).priorities).toEqual([]);

    const tree = await workspaceTree(app, workspace.id);
    expect(tree.map((p) => p.id)).toEqual([
      root.id,
      middle.id,
      leaf.id,
      lonely.id,
    ]);

    // Closing hides it from the boards and keeps it in the tree.
    expect((await patch(app, leaf.id, { status: "closed" })).status).toBe(200);
    expect((await boardPriorities(app, build.id)).priorities).toEqual([]);
    const active = await send(
      app,
      "GET",
      `/workspace/${workspace.id}/priorities?status=active`,
    );
    expect(
      ((await active.json()) as { priorities: Body[] }).priorities.map(
        (p) => p.id,
      ),
    ).toEqual([root.id, middle.id, lonely.id]);
  });

  it("refuses a cycle of parents, also from two moves at once", async () => {
    const { app, workspace } = await setup();
    const a = await createPriority(app, workspace.id, { title: "A" });
    const b = await createPriority(app, workspace.id, {
      title: "B",
      parentId: a.id,
    });
    const c = await createPriority(app, workspace.id, {
      title: "C",
      parentId: b.id,
    });

    const self = await patch(app, a.id, { parentId: a.id });
    expect(self.status).toBe(409);
    expect((await readErrorBody(self)).code).toBe("PRIORITY_CYCLE");
    const grandchild = await patch(app, a.id, { parentId: c.id });
    expect(grandchild.status).toBe(409);

    // Two roots each moved under the other at the same time: one wins.
    const x = await createPriority(app, workspace.id, { title: "X" });
    const y = await createPriority(app, workspace.id, { title: "Y" });
    const results = await Promise.all([
      patch(app, x.id, { parentId: y.id }),
      patch(app, y.id, { parentId: x.id }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);

    const rows = await db.select().from(priorityTable);
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const row of rows) {
      const seen = new Set<string>();
      for (
        let at: string | null = row.id;
        at;
        at = byId.get(at)?.parentId ?? null
      ) {
        expect(seen.has(at)).toBe(false);
        seen.add(at);
      }
    }
  });

  it("moves a priority to another parent and closes the gap it leaves", async () => {
    const { app, workspace } = await setup();
    const a = await createPriority(app, workspace.id, { title: "A" });
    const b = await createPriority(app, workspace.id, { title: "B" });
    const a1 = await createPriority(app, workspace.id, {
      title: "A1",
      parentId: a.id,
    });
    await createPriority(app, workspace.id, { title: "A2", parentId: a.id });
    await createPriority(app, workspace.id, { title: "B1", parentId: b.id });

    const moved = await patch(app, a1.id, { parentId: b.id, position: 0 });
    expect(await moved.json()).toMatchObject({ parentId: b.id, position: 0 });

    const positions = Object.fromEntries(
      (await db.select().from(priorityTable)).map((row) => [
        row.title,
        row.position,
      ]),
    );
    expect(positions).toMatchObject({ A2: 0, A1: 0, B1: 1 });
  });

  it("only links projects of the workspace the caller can read, and keeps hidden links on edit", async () => {
    const { app, admin, workspace, build, ops } = await setup();
    const { workspace: foreign } = await createWorkspaceMember({
      role: "owner",
    });
    const { project: foreignProject } = await createProjectFixture({
      workspaceId: foreign.id,
    });
    const res = await send(
      app,
      "POST",
      `/workspace/${workspace.id}/priorities`,
      {
        title: "Ajena",
        projectIds: [foreignProject.id],
      },
    );
    expect(res.status).toBe(400);
    expect((await readErrorBody(res)).code).toBe("PRIORITY_PROJECT_NOT_FOUND");

    const priority = await createPriority(app, workspace.id, {
      title: "Compartida",
      projectIds: [build.id, ops.id],
    });

    // An administrator restricted to `build` sees only that link and, by
    // replacing the links, does not drop `ops`, which it never saw.
    const restricted = await addMember(workspace.id, "admin", "Pablo");
    await db.insert(schema.workspaceMemberAccessTable).values({
      workspaceId: workspace.id,
      userId: restricted.id,
      projectAccess: "selected",
    });
    await db.insert(schema.workspaceMemberProjectTable).values({
      workspaceId: workspace.id,
      userId: restricted.id,
      projectId: build.id,
    });
    vi.restoreAllMocks();
    mockAuthenticatedSession(restricted);
    const read = await send(app, "GET", `/priority/${priority.id}`);
    expect(
      ((await read.json()) as { projects: Body[] }).projects.map((p) => p.id),
    ).toEqual([build.id]);
    const cleared = await patch(app, priority.id, { projectIds: [] });
    expect(cleared.status).toBe(200);
    expect(((await cleared.json()) as { projects: Body[] }).projects).toEqual(
      [],
    );
    const forbidden = await patch(app, priority.id, { projectIds: [ops.id] });
    expect(forbidden.status).toBe(400);
    // The history hides `ops` from this reader too, as the links do.
    const restrictedHistory = await send(
      app,
      "GET",
      `/priority/${priority.id}/history`,
    );
    const { changes: hidden } = (await restrictedHistory.json()) as {
      changes: { kind: string; previous: Body | null; value: Body }[];
    };
    expect(
      hidden.map((c) => [c.previous?.projectIds, c.value.projectIds]),
    ).toEqual([
      [[build.id], []],
      [undefined, [build.id]],
    ]);

    vi.restoreAllMocks();
    mockAuthenticatedSession(admin);
    const full = await send(app, "GET", `/priority/${priority.id}`);
    expect(
      ((await full.json()) as { projects: Body[] }).projects.map((p) => p.id),
    ).toEqual([ops.id]);
    const fullHistory = await send(
      app,
      "GET",
      `/priority/${priority.id}/history`,
    );
    const { changes: all } = (await fullHistory.json()) as {
      changes: { previous: Body | null; value: Body }[];
    };
    expect(all[0]?.previous?.projectIds).toEqual([build.id, ops.id].sort());
    expect(all[0]?.value.projectIds).toEqual([ops.id]);
  });

  it("answers 404 for a priority of another workspace", async () => {
    const { app, workspace } = await setup();
    const mine = await createPriority(app, workspace.id, { title: "Mía" });
    const { user: stranger } = await createWorkspaceMember({ role: "owner" });
    vi.restoreAllMocks();
    mockAuthenticatedSession(stranger);
    expect((await send(app, "GET", `/priority/${mine.id}`)).status).toBe(404);
    expect((await patch(app, mine.id, { title: "x" })).status).toBe(404);
  });

  it("sends priorities only to destinations administrators registered, and stops when one is removed", async () => {
    const { app, admin, member, workspace } = await setup();

    // Without a registered destination nothing leaves, though the project
    // has a generic webhook that sends every task event.
    const { user: otherAdmin, workspace: bare } = await createWorkspaceMember({
      role: "owner",
    });
    const { project: bareProject } = await createProjectFixture({
      workspaceId: bare.id,
    });
    await db.insert(schema.integrationTable).values({
      projectId: bareProject.id,
      type: "generic-webhook",
      isActive: true,
      config: JSON.stringify({ webhookUrl: projectWebhookUrl, secret: SECRET }),
    });
    vi.restoreAllMocks();
    mockAuthenticatedSession(otherAdmin);
    await createPriority(app, bare.id, { title: "Sin destino" });
    await quietWindow();
    expect(deliveries).toHaveLength(0);
    expect(projectHits).toBe(0);

    vi.restoreAllMocks();
    mockAuthenticatedSession(admin);

    const list = await send(
      app,
      "GET",
      `/workspace/${workspace.id}/priority-webhooks`,
    );
    expect(list.status).toBe(200);
    const { webhooks } = (await list.json()) as { webhooks: Body[] };
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0]).toMatchObject({ url: webhookUrl, hasSecret: true });
    expect(webhooks[0]).not.toHaveProperty("secret");

    const again = await send(
      app,
      "POST",
      `/workspace/${workspace.id}/priority-webhooks`,
      {
        url: webhookUrl,
      },
    );
    expect(again.status).toBe(409);
    const notHttp = await send(
      app,
      "POST",
      `/workspace/${workspace.id}/priority-webhooks`,
      {
        url: "file:///etc/passwd",
      },
    );
    expect(notHttp.status).toBe(400);

    // A member can neither see nor change the destinations.
    vi.restoreAllMocks();
    mockAuthenticatedSession(member);
    expect(
      (await send(app, "GET", `/workspace/${workspace.id}/priority-webhooks`))
        .status,
    ).toBe(403);
    expect(
      (
        await send(
          app,
          "POST",
          `/workspace/${workspace.id}/priority-webhooks`,
          {
            url: "https://example.com/hook",
          },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await send(
          app,
          "DELETE",
          `/workspace/${workspace.id}/priority-webhooks/${webhooks[0]?.id}`,
        )
      ).status,
    ).toBe(403);

    // Another workspace's administrator cannot remove it either.
    vi.restoreAllMocks();
    mockAuthenticatedSession(otherAdmin);
    expect(
      (
        await send(
          app,
          "DELETE",
          `/workspace/${bare.id}/priority-webhooks/${webhooks[0]?.id}`,
        )
      ).status,
    ).toBe(404);

    vi.restoreAllMocks();
    mockAuthenticatedSession(admin);
    const removed = await send(
      app,
      "DELETE",
      `/workspace/${workspace.id}/priority-webhooks/${webhooks[0]?.id}`,
    );
    expect(removed.status).toBe(200);
    await createPriority(app, workspace.id, { title: "Tras quitarlo" });
    await quietWindow();
    expect(deliveries).toHaveLength(0);
    expect(projectHits).toBe(0);
  });

  it("keeps the published contract samples in the shape of the real API", async () => {
    const response = JSON.parse(
      readFileSync(new URL("intelia-project-priorities.json", SAMPLES), "utf8"),
    );
    const sample = JSON.parse(
      readFileSync(new URL("intelia-priority-changed.json", SAMPLES), "utf8"),
    );
    expect(() =>
      projectPrioritiesSchema.parse(reviveDates(response)),
    ).not.toThrow();

    const { app, workspace, build } = await setup();
    const root = await createPriority(app, workspace.id, { title: "Raíz" });
    const child = await createPriority(app, workspace.id, {
      title: "Hija",
      parentId: root.id,
      projectIds: [build.id],
    });
    expect((await patch(app, child.id, { body: "Texto" })).status).toBe(200);
    const events = await waitForDeliveries(3);
    const updated = events.find((d) => d.body.data.kind === "updated");
    expect(shape(updated?.body)).toEqual(shape(sample));
    expect(shape(await boardPriorities(app, build.id))).toEqual(
      shape(response),
    );
  });
});

// Every key, nested; an array by its first element. Values are left out.
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return [shape(value[0])];
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, shape(entry)]),
    );
  }
  return typeof value;
}

// The sample is JSON as served; the response schema holds Dates.
function reviveDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveDates);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        key.endsWith("At") && typeof entry === "string"
          ? new Date(entry)
          : reviveDates(entry),
      ]),
    );
  }
  return value;
}
