// Intelia fork: our hooks on upstream's public.task (README-INTELIA.md,
// «Base de datos» and «Si upstream recrea public.task»). On a dedicated
// database with data: two startups leave the same catalog; an upstream-style
// recreation of `task` gets its trigger back on the next startup, which then
// fails naming the missing foreign keys; the documented repair restores them
// and the startup goes through.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { schema } from "../../apps/api/src/database";
import { migrateInteliaSchema } from "../../apps/api/src/intelia/migrate";
import {
  initiativeChangeTable,
  initiativeTable,
  taskAutomationTable,
  taskClassificationTable,
  taskInitiativeTable,
} from "../../apps/api/src/intelia/schema";
import {
  CLOSE_PLAN_TRIGGER,
  expectedTaskForeignKeys,
} from "../../apps/api/src/intelia/task-hooks";

const apiDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../apps/api",
);
const repairDir = resolve(apiDir, "drizzle-intelia/repair");

let adminUrl: string;
let databaseName: string;
let pool: Pool;
let db: NodePgDatabase;

async function withAdminClient(run: (client: Client) => Promise<void>) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await run(client);
  } finally {
    await client.end();
  }
}

// The database part of runStartupTasks (apps/api/src/index.ts), in its order.
async function startup() {
  await migrate(db, { migrationsFolder: resolve(apiDir, "drizzle") });
  await migrateInteliaSchema(db, resolve(apiDir, "drizzle-intelia"));
}

async function catalog() {
  const triggers = await db.execute<{ name: string }>(sql`
    SELECT tgname AS name FROM pg_trigger
    WHERE tgrelid = to_regclass('public.task') AND NOT tgisinternal`);
  const keys = await db.execute<{ name: string }>(sql`
    SELECT c.conname AS name FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.contype = 'f' AND n.nspname = 'intelia'
      AND c.confrelid = to_regclass('public.task')
    ORDER BY 1`);
  const migrations = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM intelia.__intelia_migrations`,
  );
  return {
    triggers: triggers.rows.map((row) => row.name),
    foreignKeys: keys.rows.map((row) => row.name),
    migrations: migrations.rows[0]?.n,
  };
}

async function counts() {
  const result = await db.execute<Record<string, number>>(sql`
    SELECT
      (SELECT count(*)::int FROM public.task) AS tasks,
      (SELECT count(*)::int FROM intelia.initiative) AS initiatives,
      (SELECT count(*)::int FROM intelia.task_initiative) AS memberships,
      (SELECT count(*)::int FROM intelia.task_automation) AS levels,
      (SELECT count(*)::int FROM intelia.task_classification) AS classifications`);
  return result.rows[0];
}

// An upstream migration that recreates `task` with its data and the same ids:
// every key pointing to it, and its triggers, go with the old table.
async function recreateTaskTable() {
  await db.execute(
    sql.raw(`
    ALTER TABLE public.task RENAME TO task_before_upstream;
    CREATE TABLE public.task (LIKE public.task_before_upstream INCLUDING ALL);
    INSERT INTO public.task SELECT * FROM public.task_before_upstream;
    DROP TABLE public.task_before_upstream CASCADE;`),
  );
}

function runSqlFile(name: string) {
  return db.execute(sql.raw(readFileSync(resolve(repairDir, name), "utf8")));
}

const ids = {
  user: "hooks-user",
  workspace: "hooks-workspace",
  project: "hooks-project",
  initiative: "hooks-initiative",
  kept: "hooks-task-kept",
  lost: "hooks-task-lost",
};

async function seed() {
  await db.insert(schema.userTable).values({
    id: ids.user,
    email: "hooks@example.com",
    emailVerified: true,
    name: "Hooks",
  });
  await db.insert(schema.workspaceTable).values({
    id: ids.workspace,
    createdAt: new Date(),
    name: "Hooks",
    slug: "hooks",
  });
  await db.insert(schema.projectTable).values({
    id: ids.project,
    workspaceId: ids.workspace,
    name: "Hooks",
    icon: "Folder",
    slug: "HOOKS",
  });
  for (const [index, id] of [ids.kept, ids.lost].entries()) {
    await db.insert(schema.taskTable).values({
      id,
      projectId: ids.project,
      title: id,
      status: "to-do",
      number: index + 1,
      position: index,
    });
    await db.insert(taskAutomationTable).values({
      taskId: id,
      level: "manual",
      verification: true,
      source: "migration",
    });
    await db.insert(taskClassificationTable).values({
      taskId: id,
      type: "validacion",
    });
  }
  await db.insert(initiativeTable).values({
    id: ids.initiative,
    projectId: ids.project,
    name: "Hooks",
    nameKey: "hooks",
    source: "migration",
  });
  for (const id of [ids.kept, ids.lost]) {
    await db.insert(taskInitiativeTable).values({
      taskId: id,
      initiativeId: ids.initiative,
      origin: "plan",
      source: "migration",
    });
  }
  // A log row that names the task that will be lost (ON DELETE SET NULL).
  await db.insert(initiativeChangeTable).values({
    initiativeId: ids.initiative,
    kind: "updated",
    previous: {},
    value: {},
    taskId: ids.lost,
    source: "migration",
  });
}

async function planClosedAt() {
  const [row] = await db
    .select({ at: initiativeTable.planClosedAt })
    .from(initiativeTable)
    .where(eq(initiativeTable.id, ids.initiative));
  return row?.at ?? null;
}

beforeAll(async () => {
  const baseUrl = new URL(process.env.DATABASE_URL ?? "");
  databaseName = `${baseUrl.pathname.replace(/^\//, "").replace(/_test$/, "")}_intelia_task_hooks_test`;
  const adminDbUrl = new URL(baseUrl);
  adminDbUrl.pathname = "/postgres";
  adminUrl = adminDbUrl.toString();
  await withAdminClient(async (client) => {
    await client.query(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    );
    await client.query(`CREATE DATABASE "${databaseName}"`);
  });
  const databaseUrl = new URL(baseUrl);
  databaseUrl.pathname = `/${databaseName}`;
  pool = new Pool({ connectionString: databaseUrl.toString(), max: 1 });
  db = drizzle(pool);
});

afterAll(async () => {
  await pool?.end();
  if (adminUrl) {
    await withAdminClient(async (client) => {
      await client.query(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
    });
  }
});

describe("Intelia hooks on public.task", () => {
  // The tests share the database and run in order: each one starts where the
  // previous one left it, as successive startups of one deployment would.
  let healthy: Awaited<ReturnType<typeof catalog>>;

  it("leaves the same catalog and data after two startups", async () => {
    await startup();
    await seed();
    healthy = await catalog();
    const before = await counts();

    await startup();

    expect(await catalog()).toEqual(healthy);
    expect(await counts()).toEqual(before);
    expect(healthy.triggers).toEqual([CLOSE_PLAN_TRIGGER]);
    expect(healthy.foreignKeys).toEqual(expectedTaskForeignKeys());
  });

  it("reinstalls the trigger and refuses to start, naming each missing key, after task is recreated", async () => {
    await recreateTaskTable();
    // A task the recreation lost: its rows in intelia are now orphans.
    await db.delete(schema.taskTable).where(eq(schema.taskTable.id, ids.lost));

    const failed = startup();
    await expect(failed).rejects.toThrow(/public\.task lacks/);
    const message = await failed.catch((error: Error) => error.message);
    for (const name of expectedTaskForeignKeys()) {
      expect(message).toContain(`foreign key ${name}`);
    }
    expect(message).not.toContain(`trigger ${CLOSE_PLAN_TRIGGER}`);
    expect(message).toContain("Si upstream recrea public.task");
    expect((await catalog()).triggers).toEqual([CLOSE_PLAN_TRIGGER]);
    expect((await catalog()).foreignKeys).toEqual([]);
  });

  it("restores the keys with the documented repair, and the next startup goes through", async () => {
    const check = await runSqlFile("task-references-check.sql");
    expect(check.rows).toContainEqual(
      expect.objectContaining({
        column: "task_initiative.task_id",
        orphans: "1",
        foreign_key: false,
      }),
    );
    expect(check.rows).toContainEqual(
      expect.objectContaining({
        column: "task_classification.task_id",
        rows: "2",
        orphans: "1",
        foreign_key: false,
      }),
    );

    await runSqlFile("task-references-repair.sql");
    await startup();

    expect(await catalog()).toEqual(healthy);
    // The orphans got their key's ON DELETE: rows gone, log column emptied.
    const memberships = await db.select().from(taskInitiativeTable);
    expect(memberships.map((row) => row.taskId)).toEqual([ids.kept]);
    const levels = await db.select().from(taskAutomationTable);
    expect(levels.map((row) => row.taskId)).toEqual([ids.kept]);
    const classifications = await db.select().from(taskClassificationTable);
    expect(classifications).toEqual([
      expect.objectContaining({ taskId: ids.kept, type: "validacion" }),
    ]);
    const [log] = await db.select().from(initiativeChangeTable);
    expect(log?.taskId).toBeNull();

    // The keys hold again, and the repair is a no-op the second time.
    await expect(
      db.insert(taskAutomationTable).values({
        taskId: "no-such-task",
        level: "manual",
        verification: true,
        source: "migration",
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(
      db.insert(taskClassificationTable).values({
        taskId: "no-such-task",
        type: "validacion",
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    await runSqlFile("task-references-repair.sql");
    expect(await catalog()).toEqual(healthy);
    expect(await db.select().from(taskClassificationTable)).toEqual(
      classifications,
    );
    const repairedCheck = await runSqlFile("task-references-check.sql");
    expect(repairedCheck.rows).toContainEqual(
      expect.objectContaining({
        column: "task_classification.task_id",
        rows: "1",
        orphans: "0",
        foreign_key: true,
      }),
    );

    // And the trigger closes the plan again.
    expect(await planClosedAt()).toBeNull();
    await db
      .update(schema.taskTable)
      .set({ status: "in-progress" })
      .where(eq(schema.taskTable.id, ids.kept));
    expect(await planClosedAt()).not.toBeNull();
  });
});
