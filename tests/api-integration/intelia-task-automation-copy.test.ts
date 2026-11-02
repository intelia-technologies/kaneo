// The level of the tasks that Kaneo creates by copying or importing: manual
// duplicate, the next occurrence of a recurring task (which duplicates), and
// POST /api/task/import/{projectId}. Every one of them leaves a level.
import { eq, sql } from "drizzle-orm";
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
import { subscribeToEvent } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import {
  type AutomationLevel,
  type AutomationSource,
  taskAutomationChangeTable,
  taskAutomationTable,
} from "../../apps/api/src/intelia/schema";
import { createNextOccurrence } from "../../apps/api/src/task/recurrence/create-next-occurrence";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

const weekly = { frequency: "weekly", interval: 1, timeZone: "UTC" } as const;

const createdEvents: string[] = [];
await subscribeToEvent<{ taskId: string }>("task.created", async (data) => {
  createdEvents.push(data.taskId);
});

let nextNumber = 1;

beforeEach(async () => {
  await resetTestDatabase();
  createdEvents.length = 0;
  nextNumber = 1;
  vi.stubEnv("INTELIA_TASK_AUTOMATION_OPTIONAL", "");
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
  // The person who first set the level of the seeded sources.
  const author = await createWorkspaceMember({ userName: "Ana" });
  await db.insert(schema.workspaceUserTable).values({
    workspaceId: workspace.id,
    userId: author.user.id,
    role: "member",
    joinedAt: new Date(),
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
  return {
    app: createApp().app,
    user,
    author: author.user,
    project,
    columns,
    roleKey,
    roleAccount,
  };
}

async function seedTask(
  projectId: string,
  columnId: string,
  overrides: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  const number = nextNumber++;
  await db
    .update(schema.projectTable)
    .set({ lastTaskNumber: number })
    .where(eq(schema.projectTable.id, projectId));
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      columnId,
      title: "Source task",
      description: "",
      status: "to-do",
      priority: "high",
      number,
      position: number,
      ...overrides,
    })
    .returning();
  if (!task) throw new Error("Failed to seed task");
  return task;
}

// A task that already has its level, written by `by` (a person by default).
async function seedLevel(
  taskId: string,
  level: AutomationLevel,
  verification: boolean,
  by: { source: AutomationSource; userId?: string; actor?: string } = {
    source: "session",
  },
) {
  await db.insert(taskAutomationTable).values({
    taskId,
    level,
    verification,
    source: by.source,
    setByUserId: by.userId ?? null,
    setByActor: by.actor ?? null,
  });
}

function duplicate(
  app: App,
  taskId: string,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return app.request(`/api/task/duplicate/${taskId}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function importTasks(
  app: App,
  projectId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.request(`/api/task/import/${projectId}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const rows = [
  { title: "First", status: "to-do" },
  { title: "Second", status: "in-progress" },
  { title: "Third", status: "done" },
];

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
    .where(eq(taskAutomationChangeTable.taskId, taskId));
}

async function taskCount() {
  return (await db.select().from(schema.taskTable)).length;
}

// A trigger that makes every insert into an intelia table fail while `run`
// executes.
async function failingInsert<T>(table: string, run: () => Promise<T>) {
  await db.execute(
    sql.raw(`CREATE OR REPLACE FUNCTION intelia.au12_test_fail() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$`),
  );
  await db.execute(
    sql.raw(`CREATE TRIGGER au12_test_fail BEFORE INSERT ON intelia.${table}
      FOR EACH ROW EXECUTE FUNCTION intelia.au12_test_fail()`),
  );
  try {
    return await run();
  } finally {
    await db.execute(
      sql.raw(
        `DROP TRIGGER au12_test_fail ON intelia.${table}; DROP FUNCTION intelia.au12_test_fail()`,
      ),
    );
  }
}

describe("API integration: Intelia level of copied and imported tasks", () => {
  describe("duplicating a task", () => {
    it.each([
      ["arranque", false],
      ["completa", true],
    ] as const)(
      "gives the copy the source's level (%s, verification %s), logged as the caller's",
      async (level, verification) => {
        const { app, user, author, project, columns } = await setup();
        const source = await seedTask(project.id, columns.todo.id);
        await seedLevel(source.id, level, verification, {
          source: "session",
          userId: author.id,
        });

        const res = await duplicate(app, source.id);

        expect(res.status).toBe(200);
        const copy = (await res.json()) as { id: string };
        expect(await stored(copy.id)).toEqual([
          expect.objectContaining({
            level,
            verification,
            source: "session",
            setByUserId: user.id,
          }),
        ]);
        expect(await changes(copy.id)).toEqual([
          expect.objectContaining({
            previousLevel: null,
            previousVerification: null,
            level,
            verification,
            changedByUserId: user.id,
            source: "session",
          }),
        ]);
        // The source keeps its own level and author.
        expect(await stored(source.id)).toEqual([
          expect.objectContaining({ level, setByUserId: author.id }),
        ]);
        await vi.waitFor(() => expect(createdEvents).toContain(copy.id));
      },
    );

    it("logs a copy made with an API key as that key's account", async () => {
      const { app, project, columns, roleKey, roleAccount } = await setup();
      const source = await seedTask(project.id, columns.todo.id);
      await seedLevel(source.id, "arranque", true);
      mockAnonymousSession();

      const res = await duplicate(app, source.id, {}, { "x-api-key": roleKey });

      expect(res.status).toBe(200);
      const copy = (await res.json()) as { id: string };
      expect(await stored(copy.id)).toEqual([
        expect.objectContaining({
          level: "arranque",
          source: "api_key",
          setByUserId: roleAccount.user.id,
        }),
      ]);
    });

    it("gives the copy the level in the body instead of the source's", async () => {
      const { app, user, author, project, columns } = await setup();
      const source = await seedTask(project.id, columns.todo.id);
      await seedLevel(source.id, "manual", true, {
        source: "session",
        userId: author.id,
      });

      const res = await duplicate(app, source.id, {
        automation: { level: "arranque", verification: false },
      });

      expect(res.status).toBe(200);
      const copy = (await res.json()) as { id: string };
      expect(await stored(copy.id)).toEqual([
        expect.objectContaining({
          level: "arranque",
          verification: false,
          setByUserId: user.id,
        }),
      ]);
      expect(await stored(source.id)).toEqual([
        expect.objectContaining({ level: "manual", verification: true }),
      ]);
    });

    it("rejects `completa` without verification in the body and creates nothing", async () => {
      const { app, project, columns } = await setup();
      const source = await seedTask(project.id, columns.todo.id);
      await seedLevel(source.id, "manual", true);

      const res = await duplicate(app, source.id, {
        automation: { level: "completa", verification: false },
      });

      expect(res.status).toBe(400);
      expect(await readErrorBody(res)).toMatchObject({
        code: "VALIDATION_ERROR",
        issues: [
          expect.objectContaining({ path: "body.automation.verification" }),
        ],
      });
      expect(await taskCount()).toBe(1);
    });

    it("asks for the level when the source has none, creates nothing, and accepts it on retry", async () => {
      const { app, user, project, columns } = await setup();
      const source = await seedTask(project.id, columns.done.id, {
        status: "done",
      });

      const rejected = await duplicate(app, source.id);

      expect(rejected.status).toBe(400);
      expect(await readErrorBody(rejected)).toMatchObject({
        code: "VALIDATION_ERROR",
        issues: [
          expect.objectContaining({
            path: "body.automation",
            message: "Required",
          }),
        ],
      });
      expect(await taskCount()).toBe(1);
      expect(await db.select().from(taskAutomationTable)).toEqual([]);
      expect(createdEvents).toEqual([]);

      const retry = await duplicate(app, source.id, {
        automation: { level: "completa", verification: true },
      });

      expect(retry.status).toBe(200);
      const copy = (await retry.json()) as { id: string };
      expect(await taskCount()).toBe(2);
      expect(await stored(copy.id)).toEqual([
        expect.objectContaining({
          level: "completa",
          verification: true,
          setByUserId: user.id,
        }),
      ]);
      // The source stays without a level.
      expect(await stored(source.id)).toEqual([]);
    });

    it("with the test exception on, copies a source without level as manual with verification", async () => {
      const { app, user, project, columns } = await setup();
      vi.stubEnv("INTELIA_TASK_AUTOMATION_OPTIONAL", "true");
      const source = await seedTask(project.id, columns.todo.id);

      const res = await duplicate(app, source.id);

      expect(res.status).toBe(200);
      const copy = (await res.json()) as { id: string };
      expect(await stored(copy.id)).toEqual([
        expect.objectContaining({
          level: "manual",
          verification: true,
          source: "session",
          setByUserId: user.id,
        }),
      ]);
      expect(await changes(copy.id)).toHaveLength(1);
    });

    it("with the test exception on, still validates a level in the body", async () => {
      const { app, project, columns } = await setup();
      vi.stubEnv("INTELIA_TASK_AUTOMATION_OPTIONAL", "true");
      const source = await seedTask(project.id, columns.todo.id);

      const res = await duplicate(app, source.id, {
        automation: { level: "completa", verification: false },
      });

      expect(res.status).toBe(400);
      expect(await taskCount()).toBe(1);
    });

    it.each([
      ["the level", "task_automation"],
      ["the change log", "task_automation_change"],
    ])(
      "rolls the copy back when %s cannot be written, publishes nothing, and a retry makes one copy",
      async (_what, table) => {
        const { app, project, columns } = await setup();
        const source = await seedTask(project.id, columns.todo.id);
        await seedLevel(source.id, "arranque", true);

        const failed = await failingInsert(table, () =>
          duplicate(app, source.id),
        );

        expect(failed.status).toBe(500);
        expect(await taskCount()).toBe(1);
        expect(await db.select().from(taskAutomationTable)).toHaveLength(1);
        expect(await db.select().from(taskAutomationChangeTable)).toEqual([]);

        const retry = await duplicate(app, source.id);

        expect(retry.status).toBe(200);
        const copy = (await retry.json()) as { id: string };
        expect(await taskCount()).toBe(2);
        expect(await stored(copy.id)).toHaveLength(1);
        expect(await changes(copy.id)).toHaveLength(1);
        // Only the retry's event: the failed attempt published none.
        await vi.waitFor(() => expect(createdEvents).toEqual([copy.id]));
      },
    );
  });

  describe("the next occurrence of a recurring task", () => {
    it("inherits the template's level and keeps its writer", async () => {
      const { project, columns, author } = await setup();
      const template = await seedTask(project.id, columns.done.id, {
        status: "done",
        recurrence: weekly,
      });
      await seedLevel(template.id, "arranque", false, {
        source: "session",
        userId: author.id,
      });

      const next = await createNextOccurrence(template.id, null);

      expect(next).not.toBeNull();
      expect(await stored(next?.id ?? "")).toEqual([
        expect.objectContaining({
          level: "arranque",
          verification: false,
          source: "session",
          setByUserId: author.id,
          setByActor: null,
        }),
      ]);
      expect(await changes(next?.id ?? "")).toEqual([
        expect.objectContaining({
          previousLevel: null,
          level: "arranque",
          verification: false,
          source: "session",
          changedByUserId: author.id,
        }),
      ]);
    });

    it("keeps the gateway's actor when the template's level came from the gateway", async () => {
      const { project, columns } = await setup();
      const template = await seedTask(project.id, columns.done.id, {
        status: "done",
        recurrence: weekly,
      });
      await seedLevel(template.id, "completa", true, {
        source: "gateway",
        actor: "agent:orq-jaime",
      });

      const next = await createNextOccurrence(template.id, null);

      expect(await stored(next?.id ?? "")).toEqual([
        expect.objectContaining({
          level: "completa",
          verification: true,
          source: "gateway",
          setByUserId: null,
          setByActor: "agent:orq-jaime",
        }),
      ]);
      expect(await changes(next?.id ?? "")).toEqual([
        expect.objectContaining({
          source: "gateway",
          changedByUserId: null,
          changedByActor: "agent:orq-jaime",
        }),
      ]);
    });

    it("gives a template without level manual with verification, logged as the migration, so the series keeps going", async () => {
      const { project, columns } = await setup();
      const template = await seedTask(project.id, columns.done.id, {
        status: "done",
        recurrence: weekly,
      });

      const next = await createNextOccurrence(template.id, null);

      expect(next).toMatchObject({ recurrence: weekly });
      expect(await stored(next?.id ?? "")).toEqual([
        expect.objectContaining({
          level: "manual",
          verification: true,
          source: "migration",
          setByUserId: null,
          setByActor: null,
        }),
      ]);
      expect(await changes(next?.id ?? "")).toEqual([
        expect.objectContaining({
          previousLevel: null,
          level: "manual",
          verification: true,
          source: "migration",
          changedByUserId: null,
        }),
      ]);
      // The next completion makes the next occurrence again.
      await db
        .update(schema.taskTable)
        .set({ status: "done", columnId: columns.done.id })
        .where(eq(schema.taskTable.id, next?.id ?? ""));
      const third = await createNextOccurrence(next?.id ?? "", null);
      expect(await stored(third?.id ?? "")).toEqual([
        expect.objectContaining({ level: "manual", source: "migration" }),
      ]);
    });

    it("rolls the occurrence back, rule included, when its level cannot be written", async () => {
      const { project, columns } = await setup();
      const template = await seedTask(project.id, columns.done.id, {
        status: "done",
        recurrence: weekly,
      });
      await seedLevel(template.id, "manual", true);

      await expect(
        failingInsert("task_automation", () =>
          createNextOccurrence(template.id, null),
        ),
      ).rejects.toThrow();

      expect(await taskCount()).toBe(1);
      const [kept] = await db
        .select({ recurrence: schema.taskTable.recurrence })
        .from(schema.taskTable)
        .where(eq(schema.taskTable.id, template.id));
      expect(kept?.recurrence).toEqual(weekly);
      expect(createdEvents).toEqual([]);

      const retry = await createNextOccurrence(template.id, null);
      expect(await stored(retry?.id ?? "")).toHaveLength(1);
    });
  });

  describe("importing tasks", () => {
    it("gives every imported task the level of the request, logged as the caller's", async () => {
      const { app, user, project } = await setup();

      const res = await importTasks(app, project.id, {
        tasks: rows,
        automation: { level: "arranque", verification: false },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        results: { successful: number; tasks: Array<{ task: { id: string } }> };
      };
      expect(body.results.successful).toBe(3);
      expect(await taskCount()).toBe(3);
      for (const { task } of body.results.tasks) {
        expect(await stored(task.id)).toEqual([
          expect.objectContaining({
            level: "arranque",
            verification: false,
            source: "session",
            setByUserId: user.id,
          }),
        ]);
        expect(await changes(task.id)).toEqual([
          expect.objectContaining({
            previousLevel: null,
            level: "arranque",
            changedByUserId: user.id,
            source: "session",
          }),
        ]);
      }
      await vi.waitFor(() => expect(createdEvents).toHaveLength(3));
    });

    it("logs an import made with an API key as that key's account", async () => {
      const { app, project, roleKey, roleAccount } = await setup();
      mockAnonymousSession();

      const res = await importTasks(
        app,
        project.id,
        {
          tasks: rows.slice(0, 1),
          automation: { level: "completa", verification: true },
        },
        { "x-api-key": roleKey },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        results: { tasks: Array<{ task: { id: string } }> };
      };
      expect(await stored(body.results.tasks[0]?.task.id ?? "")).toEqual([
        expect.objectContaining({
          level: "completa",
          source: "api_key",
          setByUserId: roleAccount.user.id,
        }),
      ]);
    });

    it("rejects a request without `automation` and imports nothing", async () => {
      const { app, project } = await setup();

      const res = await importTasks(app, project.id, { tasks: rows });

      expect(res.status).toBe(400);
      expect(await readErrorBody(res)).toMatchObject({
        code: "VALIDATION_ERROR",
        issues: [expect.objectContaining({ path: "body.automation" })],
      });
      expect(await taskCount()).toBe(0);
      expect(await db.select().from(taskAutomationTable)).toEqual([]);
    });

    it("rejects `completa` without verification and imports nothing", async () => {
      const { app, project } = await setup();

      const res = await importTasks(app, project.id, {
        tasks: rows,
        automation: { level: "completa", verification: false },
      });

      expect(res.status).toBe(400);
      expect(await readErrorBody(res)).toMatchObject({
        issues: [
          expect.objectContaining({
            path: "body.automation.verification",
            message: "`completa` requires verification: true",
          }),
        ],
      });
      expect(await taskCount()).toBe(0);
    });

    it("with the test exception on, defaults a missing level to manual and still validates a given one", async () => {
      const { app, project } = await setup();
      vi.stubEnv("INTELIA_TASK_AUTOMATION_OPTIONAL", "true");

      const missing = await importTasks(app, project.id, {
        tasks: rows.slice(0, 1),
      });
      const invalid = await importTasks(app, project.id, {
        tasks: rows.slice(1, 2),
        automation: { level: "completa", verification: false },
      });

      expect(missing.status).toBe(200);
      const body = (await missing.json()) as {
        results: { tasks: Array<{ task: { id: string } }> };
      };
      expect(await stored(body.results.tasks[0]?.task.id ?? "")).toEqual([
        expect.objectContaining({ level: "manual", verification: true }),
      ]);
      expect(invalid.status).toBe(400);
      expect(await taskCount()).toBe(1);
    });

    it.each([
      ["the level", "task_automation"],
      ["the change log", "task_automation_change"],
    ])(
      "creates no task and publishes nothing for a task whose %s cannot be written",
      async (_what, table) => {
        const { app, project } = await setup();
        const body = {
          tasks: rows,
          automation: { level: "arranque", verification: true },
        };

        const failed = await failingInsert(table, () =>
          importTasks(app, project.id, body),
        );

        expect(failed.status).toBe(200);
        expect(
          ((await failed.json()) as { results: { successful: number } })
            .results,
        ).toMatchObject({ total: 3, successful: 0, failed: 3 });
        expect(await taskCount()).toBe(0);
        expect(await db.select().from(taskAutomationTable)).toEqual([]);
        expect(await db.select().from(taskAutomationChangeTable)).toEqual([]);
        expect(createdEvents).toEqual([]);

        const retry = await importTasks(app, project.id, body);

        expect(retry.status).toBe(200);
        expect(await taskCount()).toBe(3);
        expect(await db.select().from(taskAutomationTable)).toHaveLength(3);
        expect(await db.select().from(taskAutomationChangeTable)).toHaveLength(
          3,
        );
        await vi.waitFor(() => expect(createdEvents).toHaveLength(3));
      },
    );
  });
});
