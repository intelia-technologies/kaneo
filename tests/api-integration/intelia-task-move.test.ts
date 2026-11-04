// Moving a task to another project keeping its identity (design 11, annex
// «Mover tareas»): only the number changes, and the old one stays an alias.
import { eq } from "drizzle-orm";
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
      assignee: { kept: true },
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
});

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
});
