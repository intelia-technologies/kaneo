// Moving a task to another project keeping its identity (design 11, annex
// «Mover tareas»): only the number changes, and the old one stays an alias.
import { and, eq, sql } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import {
  initiativeTable,
  routineTable,
  taskAliasTable,
  taskAutomationTable,
  taskInitiativeTable,
} from "../../apps/api/src/intelia/schema";
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

beforeEach(async () => {
  await resetTestDatabase();
  vi.restoreAllMocks();
  vi.stubEnv("INTELIA_TASK_AUTOMATION_OPTIONAL", "true");
  vi.stubEnv("INTELIA_TASK_INITIATIVE_OPTIONAL", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function seedTask(
  project: { id: string },
  number: number,
  overrides: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  await db
    .update(schema.projectTable)
    .set({ lastTaskNumber: number })
    .where(eq(schema.projectTable.id, project.id));
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId: project.id,
      title: `Task ${number}`,
      description: "",
      priority: "medium",
      status: "in-review",
      number,
      position: number,
      ...overrides,
    })
    .returning();
  if (!task) throw new Error("Failed to seed task");
  return task;
}

async function setup() {
  const { user, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Pablo",
  });
  const sf = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Software Factory",
    slug: "SF",
  });
  const infra = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Infraestructura",
    slug: "INFRA",
  });
  const other = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Otro",
    slug: "OT",
  });
  await db
    .update(schema.projectTable)
    .set({ lastTaskNumber: 11 })
    .where(eq(schema.projectTable.id, infra.project.id));

  const task = await seedTask(sf.project, 745, {
    userId: user.id,
    columnId: sf.columns.inReview.id,
    recurrence: null,
  });
  const dependency = await seedTask(other.project, 3, { status: "to-do" });

  const [comment] = await db
    .insert(schema.activityTable)
    .values({
      taskId: task.id,
      type: "comment",
      userId: user.id,
      content: "Contexto que no se puede perder",
    })
    .returning();
  await db.insert(schema.taskRelationTable).values({
    sourceTaskId: task.id,
    targetTaskId: dependency.id,
    relationType: "blocks",
  });
  await db.insert(routineTable).values({
    taskId: task.id,
    cron: "0 9 * * 1",
    ownerId: user.id,
    nextRunAt: new Date("2030-01-07T08:00:00Z"),
  });
  await db.insert(taskAutomationTable).values({
    taskId: task.id,
    level: "completa",
    verification: true,
    setByUserId: user.id,
    source: "session",
  });
  await db.insert(schema.labelTable).values({
    name: "infra",
    color: "#00f",
    taskId: task.id,
    workspaceId: workspace.id,
  });

  const [sfField] = await db
    .insert(schema.customFieldDefinitionTable)
    .values({
      projectId: sf.project.id,
      name: "Entorno",
      type: "dropdown",
      options: ["staging", "producción"],
    })
    .returning();
  const [infraField] = await db
    .insert(schema.customFieldDefinitionTable)
    .values({
      projectId: infra.project.id,
      name: "entorno",
      type: "dropdown",
      options: ["producción", "staging", "local"],
    })
    .returning();
  if (!sfField || !infraField) throw new Error("Failed to seed fields");
  await db.insert(schema.customFieldValueTable).values({
    taskId: task.id,
    fieldId: sfField.id,
    value: "producción",
  });

  const [initiative] = await db
    .insert(initiativeTable)
    .values({
      projectId: sf.project.id,
      name: "Infraestructura base",
      nameKey: "infraestructura base",
      designUrl: "https://example.com/design/11",
      approvedBy: "Pablo",
      approvedAt: new Date("2026-11-04T10:00:00Z"),
      createdByUserId: user.id,
      source: "session",
    })
    .returning();
  if (!initiative) throw new Error("Failed to seed initiative");
  await db.insert(taskInitiativeTable).values({
    taskId: task.id,
    initiativeId: initiative.id,
    origin: "plan",
    setByUserId: user.id,
    source: "session",
  });

  mockAuthenticatedSession(user);
  return {
    app: createApp().app,
    user,
    workspace,
    sf,
    infra,
    task,
    dependency,
    comment,
    sfField,
    infraField,
    initiative,
  };
}

function move(app: App, taskId: string, body: Record<string, unknown>) {
  return app.request(`/api/intelia/task/${taskId}/move`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Everything that a move may touch, to compare before and after.
async function snapshot(taskId: string) {
  const [task] = await db
    .select()
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, taskId));
  return {
    task,
    projects: await db
      .select({
        id: schema.projectTable.id,
        lastTaskNumber: schema.projectTable.lastTaskNumber,
      })
      .from(schema.projectTable)
      .orderBy(schema.projectTable.id),
    fields: await db
      .select()
      .from(schema.customFieldValueTable)
      .where(eq(schema.customFieldValueTable.taskId, taskId)),
    membership: await db
      .select()
      .from(taskInitiativeTable)
      .where(eq(taskInitiativeTable.taskId, taskId)),
    initiatives: await db.select().from(initiativeTable),
    aliases: await db.select().from(taskAliasTable),
    labels: await db.select().from(schema.labelTable),
  };
}

describe("POST /api/intelia/task/{taskId}/move", () => {
  it("moves the task keeping everything, with a new number and the old one as alias", async () => {
    const { app, task, dependency, comment, infra, infraField, initiative } =
      await setup();

    const response = await move(app, task.id, { projectId: infra.project.id });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      dryRun: false,
      taskId: task.id,
      from: { projectSlug: "SF", number: 745, ticketId: "SF-745" },
      to: { projectSlug: "INFRA", number: 12, ticketId: "INFRA-12" },
      column: { slug: "in-review", toColumnId: infra.columns.inReview.id },
      customFields: [
        { name: "Entorno", toFieldId: infraField.id, action: "kept" },
      ],
      labels: [{ name: "infra", action: "kept" }],
      initiative: { name: "Infraestructura base", created: true },
      assignee: { userId: task.userId },
    });

    const after = await snapshot(task.id);
    expect(after.task).toMatchObject({
      id: task.id,
      projectId: infra.project.id,
      number: 12,
      status: "in-review",
      columnId: infra.columns.inReview.id,
      title: task.title,
      userId: task.userId,
    });

    // Comments, relations with other projects, routine and automation hang
    // from the id and stay.
    const [stillComment] = await db
      .select()
      .from(schema.activityTable)
      .where(eq(schema.activityTable.id, comment?.id ?? ""));
    expect(stillComment).toMatchObject({
      taskId: task.id,
      content: "Contexto que no se puede perder",
    });
    const relations = await db
      .select()
      .from(schema.taskRelationTable)
      .where(eq(schema.taskRelationTable.sourceTaskId, task.id));
    expect(relations).toEqual([
      expect.objectContaining({
        targetTaskId: dependency.id,
        relationType: "blocks",
      }),
    ]);
    const [routine] = await db
      .select()
      .from(routineTable)
      .where(eq(routineTable.taskId, task.id));
    expect(routine).toMatchObject({ cron: "0 9 * * 1", active: true });
    const [automation] = await db
      .select()
      .from(taskAutomationTable)
      .where(eq(taskAutomationTable.taskId, task.id));
    expect(automation).toMatchObject({ level: "completa", verification: true });

    // Remapped: the field value now belongs to the destination's field, the
    // label stays, the initiative is the destination's copy.
    expect(after.fields).toEqual([
      expect.objectContaining({ fieldId: infraField.id, value: "producción" }),
    ]);
    expect(after.labels).toEqual([
      expect.objectContaining({ name: "infra", taskId: task.id }),
    ]);
    const copy = after.initiatives.find(
      (row) => row.projectId === infra.project.id,
    );
    expect(copy).toMatchObject({
      name: "Infraestructura base",
      designUrl: initiative.designUrl,
      approvedBy: "Pablo",
      approvedAt: initiative.approvedAt,
    });
    expect(after.membership).toEqual([
      expect.objectContaining({ initiativeId: copy?.id }),
    ]);

    expect(after.aliases).toEqual([
      expect.objectContaining({ taskId: task.id, number: 745 }),
    ]);
  });

  it("joins the destination's initiative of the same name instead of copying it", async () => {
    const { app, task, infra, user } = await setup();
    const [existing] = await db
      .insert(initiativeTable)
      .values({
        projectId: infra.project.id,
        name: "INFRAESTRUCTURA  base",
        nameKey: "infraestructura base",
        createdByUserId: user.id,
        source: "session",
      })
      .returning();

    const response = await move(app, task.id, { projectId: infra.project.id });
    expect(response.status).toBe(200);
    expect((await response.json()).initiative).toMatchObject({
      toInitiativeId: existing?.id,
      created: false,
    });
    const [membership] = await db
      .select()
      .from(taskInitiativeTable)
      .where(eq(taskInitiativeTable.taskId, task.id));
    expect(membership?.initiativeId).toBe(existing?.id);
  });

  it("fails without changing anything when the destination lacks the column", async () => {
    const { app, task, infra } = await setup();
    await db
      .delete(schema.columnTable)
      .where(eq(schema.columnTable.id, infra.columns.inReview.id));
    const before = await snapshot(task.id);

    const response = await move(app, task.id, { projectId: infra.project.id });
    expect(response.status).toBe(409);
    const error = await readErrorBody(response);
    expect(error.code).toBe("TASK_MOVE_UNMAPPABLE");
    expect(error.issues).toEqual([
      { path: "column", message: expect.stringContaining("in-review") },
    ]);
    expect(await snapshot(task.id)).toEqual(before);
  });

  it("moves an archived task without a column to a destination that lacks an archived column, keeps status, and resolves alias", async () => {
    const { app, sf, infra } = await setup();
    const [destColumn] = await db
      .select()
      .from(schema.columnTable)
      .where(
        and(
          eq(schema.columnTable.projectId, infra.project.id),
          eq(schema.columnTable.slug, "archived"),
        ),
      );
    expect(destColumn).toBeUndefined();

    const archivedTask = await seedTask(sf.project, 800, {
      status: "archived",
      columnId: null,
    });

    const response = await move(app, archivedTask.id, {
      projectId: infra.project.id,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      taskId: archivedTask.id,
      from: { projectSlug: "SF", number: 800, ticketId: "SF-800" },
      to: {
        projectId: infra.project.id,
        projectSlug: "INFRA",
        number: 12,
        ticketId: "INFRA-12",
      },
      column: {
        slug: "archived",
        name: "archived",
        fromColumnId: null,
        toColumnId: null,
      },
    });

    const [persisted] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, archivedTask.id));
    expect(persisted).toBeDefined();
    expect(persisted.projectId).toBe(infra.project.id);
    expect(persisted.number).toBe(12);
    expect(persisted.status).toBe("archived");
    expect(persisted.columnId).toBeNull();

    const aliases = await db
      .select()
      .from(taskAliasTable)
      .where(eq(taskAliasTable.taskId, archivedTask.id));
    expect(aliases).toEqual([
      expect.objectContaining({
        taskId: archivedTask.id,
        projectId: sf.project.id,
        number: 800,
      }),
    ]);

    const byTicket = await app.request("/api/task/by-ticket-id/SF-800");
    expect(byTicket.status).toBe(200);
    expect(await byTicket.json()).toMatchObject({ id: archivedTask.id });
  });

  it("moves a planned task without a column to a destination that lacks a planned column, keeps status, and resolves alias", async () => {
    const { app, sf, infra } = await setup();
    const [destColumn] = await db
      .select()
      .from(schema.columnTable)
      .where(
        and(
          eq(schema.columnTable.projectId, infra.project.id),
          eq(schema.columnTable.slug, "planned"),
        ),
      );
    expect(destColumn).toBeUndefined();

    const plannedTask = await seedTask(sf.project, 801, {
      status: "planned",
      columnId: null,
    });

    const response = await move(app, plannedTask.id, {
      projectId: infra.project.id,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      taskId: plannedTask.id,
      from: { projectSlug: "SF", number: 801, ticketId: "SF-801" },
      to: {
        projectId: infra.project.id,
        projectSlug: "INFRA",
        number: 12,
        ticketId: "INFRA-12",
      },
      column: {
        slug: "planned",
        name: "planned",
        fromColumnId: null,
        toColumnId: null,
      },
    });

    const [persisted] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, plannedTask.id));
    expect(persisted).toBeDefined();
    expect(persisted.projectId).toBe(infra.project.id);
    expect(persisted.number).toBe(12);
    expect(persisted.status).toBe("planned");
    expect(persisted.columnId).toBeNull();

    const aliases = await db
      .select()
      .from(taskAliasTable)
      .where(eq(taskAliasTable.taskId, plannedTask.id));
    expect(aliases).toEqual([
      expect.objectContaining({
        taskId: plannedTask.id,
        projectId: sf.project.id,
        number: 801,
      }),
    ]);

    const byTicket = await app.request("/api/task/by-ticket-id/SF-801");
    expect(byTicket.status).toBe(200);
    expect(await byTicket.json()).toMatchObject({ id: plannedTask.id });
  });

  it("fails on a missing field option unless the field is discarded", async () => {
    const { app, task, infra, infraField } = await setup();
    await db
      .update(schema.customFieldDefinitionTable)
      .set({ options: ["staging"] })
      .where(eq(schema.customFieldDefinitionTable.id, infraField.id));
    const before = await snapshot(task.id);

    const refused = await move(app, task.id, { projectId: infra.project.id });
    expect(refused.status).toBe(409);
    expect((await readErrorBody(refused)).issues).toEqual([
      {
        path: "customFields.Entorno",
        message: expect.stringContaining("producción"),
      },
    ]);
    expect(await snapshot(task.id)).toEqual(before);

    const discarded = await move(app, task.id, {
      projectId: infra.project.id,
      discardFields: ["entorno"],
    });
    expect(discarded.status).toBe(200);
    expect((await discarded.json()).customFields).toEqual([
      expect.objectContaining({ name: "Entorno", action: "discarded" }),
    ]);
    expect((await snapshot(task.id)).fields).toEqual([]);
  });

  it("dry run reports the move and writes nothing", async () => {
    const { app, task, infra } = await setup();
    const before = await snapshot(task.id);

    const response = await move(app, task.id, {
      projectId: infra.project.id,
      dryRun: true,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      dryRun: true,
      to: { ticketId: "INFRA-12" },
      column: { slug: "in-review" },
      customFields: [{ name: "Entorno", action: "kept" }],
      initiative: { name: "Infraestructura base", created: true },
    });
    expect(await snapshot(task.id)).toEqual(before);
  });

  it("fails without changing anything when the assignee cannot see the destination", async () => {
    const { app, task, workspace, sf, infra } = await setup();
    const assignee = await addWorkspaceMember(workspace.id);
    await restrictToProjects(workspace.id, assignee.id, [sf.project.id]);
    await db
      .update(schema.taskTable)
      .set({ userId: assignee.id })
      .where(eq(schema.taskTable.id, task.id));
    const before = await snapshot(task.id);

    const response = await move(app, task.id, { projectId: infra.project.id });
    expect(response.status).toBe(409);
    expect((await readErrorBody(response)).issues).toEqual([
      { path: "assignee", message: expect.any(String) },
    ]);
    expect(await snapshot(task.id)).toEqual(before);
  });

  it("checks access to the project the task is in once locked, not the one authorized", async () => {
    const { app, task, workspace, sf, infra, dependency } = await setup();
    const member = await addWorkspaceMember(workspace.id);
    await restrictToProjects(workspace.id, member.id, [
      sf.project.id,
      infra.project.id,
    ]);
    mockAuthenticatedSession(member);
    const hidden = dependency.projectId;

    // Someone else holds the task while the request passes its middleware on
    // SF, then moves it to a project the caller cannot see.
    const locked = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();
    const holder = db.transaction(async (tx) => {
      await tx
        .select({ id: schema.taskTable.id })
        .from(schema.taskTable)
        .where(eq(schema.taskTable.id, task.id))
        .for("update");
      locked.resolve();
      await released.promise;
      await tx
        .update(schema.taskTable)
        .set({ projectId: hidden, number: 4 })
        .where(eq(schema.taskTable.id, task.id));
    });
    await locked.promise;

    const request = move(app, task.id, { projectId: infra.project.id });
    await waitForLockWaiter();
    released.resolve();
    await holder;

    const response = await request;
    expect(response.status).toBe(403);
    const [after] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    expect(after).toMatchObject({ projectId: hidden, number: 4 });
    expect(await db.select().from(taskAliasTable)).toEqual([]);
  });

  it("refuses when the source project moves to another workspace while the request waits", async () => {
    const { app, task, sf } = await setup();
    // A workspace the caller is not a member of, with a destination project.
    const { workspace: foreign } = await createWorkspaceMember();
    const target = await createProjectFixture({
      workspaceId: foreign.id,
      slug: "FX",
    });
    // Unassigned and without custom fields, as in the reported case: no
    // remapping problem stops it.
    await db
      .update(schema.taskTable)
      .set({ userId: null })
      .where(eq(schema.taskTable.id, task.id));
    await db
      .delete(schema.customFieldValueTable)
      .where(eq(schema.customFieldValueTable.taskId, task.id));
    const before = await snapshot(task.id);

    // Someone else holds SF while the request passes its middleware in the
    // caller's workspace, then moves SF to the foreign workspace.
    const locked = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();
    const holder = db.transaction(async (tx) => {
      await tx
        .select({ id: schema.projectTable.id })
        .from(schema.projectTable)
        .where(eq(schema.projectTable.id, sf.project.id))
        .for("update");
      locked.resolve();
      await released.promise;
      await tx
        .update(schema.projectTable)
        .set({ workspaceId: foreign.id })
        .where(eq(schema.projectTable.id, sf.project.id));
    });
    await locked.promise;

    const request = move(app, task.id, { projectId: target.project.id });
    await waitForLockWaiter();
    released.resolve();
    await holder;

    const response = await request;
    expect(response.status).toBe(409);
    expect((await readErrorBody(response)).code).toBe(
      "TASK_MOVED_CONCURRENTLY",
    );
    const after = await snapshot(task.id);
    expect(after.task).toEqual(before.task);
    expect(after.aliases).toEqual([]);
    const [destination] = await db
      .select({ lastTaskNumber: schema.projectTable.lastTaskNumber })
      .from(schema.projectTable)
      .where(eq(schema.projectTable.id, target.project.id));
    expect(destination?.lastTaskNumber).toBe(
      before.projects.find((p) => p.id === target.project.id)?.lastTaskNumber,
    );
  });
});

// Until another session waits on a row lock (the move, on the task's). The
// database exposes no event for that, so it is polled.
async function waitForLockWaiter() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = await db.execute(
      sql`select count(*)::int as waiting from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()`,
    );
    const [row] = result.rows as { waiting: number }[];
    if ((row?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The move never waited on the task's lock");
}

describe("finding a moved task by its former number", () => {
  it("search, ticket lookup and the alias list answer to SF-745", async () => {
    const { app, task, infra, workspace } = await setup();
    expect(
      (await move(app, task.id, { projectId: infra.project.id })).status,
    ).toBe(200);

    const search = await app.request(
      `/api/search?q=SF-745&type=tasks&workspaceId=${workspace.id}`,
    );
    expect(search.status).toBe(200);
    const { results } = await search.json();
    expect(results[0]).toMatchObject({
      id: task.id,
      projectSlug: "INFRA",
      taskNumber: 12,
    });

    const byTicket = await app.request("/api/task/by-ticket-id/SF-745");
    expect(byTicket.status).toBe(200);
    expect(await byTicket.json()).toMatchObject({ id: task.id, number: 12 });

    const aliases = await app.request(`/api/intelia/task/${task.id}/aliases`);
    expect(aliases.status).toBe(200);
    expect(await aliases.json()).toEqual({
      aliases: [
        expect.objectContaining({
          ticketId: "SF-745",
          projectSlug: "SF",
          number: 745,
        }),
      ],
    });
  });

  it("resolves the alias to the moved task itself, not to whatever has its new number", async () => {
    const { app, task, infra, user } = await setup();
    expect(
      (await move(app, task.id, { projectId: infra.project.id })).status,
    ).toBe(200);

    // Another workspace the caller reads, with its own INFRA-12.
    const { workspace: second } = await createWorkspaceMember();
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: second.id,
      userId: user.id,
      role: "member",
      joinedAt: new Date(),
    });
    const secondInfra = await createProjectFixture({
      workspaceId: second.id,
      slug: "INFRA",
    });
    await seedTask(secondInfra.project, 12, { status: "to-do" });

    const byTicket = await app.request("/api/task/by-ticket-id/SF-745");
    expect(byTicket.status).toBe(200);
    expect(await byTicket.json()).toMatchObject({ id: task.id });
    const elsewhere = await app.request(
      `/api/task/by-ticket-id/SF-745?workspaceId=${second.id}`,
    );
    expect(elsewhere.status).toBe(404);
  });

  it("answers 404 to aliases that point at each other across workspaces the caller cannot read", async () => {
    const caller = await createWorkspaceMember();
    mockAuthenticatedSession(caller.user);
    // In each foreign workspace a task now in one project had the other
    // project's key: A-1 → B-1 in one, B-1 → A-1 in the other.
    for (const [from, to] of [
      ["A", "B"],
      ["B", "A"],
    ] as const) {
      const { workspace } = await createWorkspaceMember();
      const left = await createProjectFixture({
        workspaceId: workspace.id,
        slug: from,
      });
      const right = await createProjectFixture({
        workspaceId: workspace.id,
        slug: to,
      });
      const moved = await seedTask(right.project, 1, { status: "to-do" });
      await db.insert(taskAliasTable).values({
        taskId: moved.id,
        projectId: left.project.id,
        number: 1,
      });
    }

    const response = await createApp().app.request(
      "/api/task/by-ticket-id/A-1",
    );
    expect(response.status).toBe(404);
  });

  it("finds a former number of a project with a full-width key", async () => {
    const { app, task, sf, infra } = await setup();
    await db
      .update(schema.projectTable)
      .set({ slug: "ＳＦ" })
      .where(eq(schema.projectTable.id, sf.project.id));
    expect(
      (await move(app, task.id, { projectId: infra.project.id })).status,
    ).toBe(200);

    const byTicket = await app.request("/api/task/by-ticket-id/sf-745");
    expect(byTicket.status).toBe(200);
    expect(await byTicket.json()).toMatchObject({ id: task.id });
  });
});
