// The one-off backfill of 0003_task_automation (design 18 §3): tasks that
// already exist when the migration runs. Replays the API startup on a
// dedicated database, first without that migration (the deployed schema) and
// then with it, as an upgrade would.
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { schema } from "../../apps/api/src/database";
import {
  INTELIA_MIGRATIONS_TABLE,
  migrateInteliaSchema,
} from "../../apps/api/src/intelia/migrate";
import {
  INTELIA_SCHEMA,
  taskAutomationChangeTable,
  taskAutomationTable,
} from "../../apps/api/src/intelia/schema";
import { DEFAULT_PROJECT_COLUMNS } from "../../apps/api/src/project/controllers/insert-project";

const apiDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../apps/api",
);
const BACKFILL_TAG = "0003_task_automation";

let workDir: string;
let inteliaFolder: string;
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

beforeAll(async () => {
  const baseUrl = new URL(process.env.DATABASE_URL ?? "");
  databaseName = `${baseUrl.pathname.replace(/^\//, "").replace(/_test$/, "")}_intelia_backfill_test`;
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

  workDir = mkdtempSync(join(tmpdir(), "intelia-backfill-"));
  inteliaFolder = join(workDir, "drizzle-intelia");
  cpSync(join(apiDir, "drizzle-intelia"), inteliaFolder, { recursive: true });
});

afterAll(async () => {
  await pool?.end();
  if (workDir) rmSync(workDir, { recursive: true, force: true });
  if (adminUrl) {
    await withAdminClient(async (client) => {
      await client.query(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
    });
  }
});

it("leaves every open task in manual with verification, logged as the migration, and closed tasks without a level", async () => {
  // The deployed schema: every intelia migration before the backfill.
  const journalPath = join(inteliaFolder, "meta", "_journal.json");
  const fullJournal = readFileSync(journalPath, "utf8");
  const journal = JSON.parse(fullJournal) as {
    entries: Array<{ tag: string }>;
  };
  const backfillIndex = journal.entries.findIndex(
    (entry) => entry.tag === BACKFILL_TAG,
  );
  expect(backfillIndex).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, backfillIndex);
  writeFileSync(journalPath, JSON.stringify(journal));
  await migrate(db, { migrationsFolder: join(apiDir, "drizzle") });
  // The migrator of that release: only the migrations, without today's
  // startup check, which expects the hooks of every migration.
  await migrate(db, {
    migrationsFolder: inteliaFolder,
    migrationsSchema: INTELIA_SCHEMA,
    migrationsTable: INTELIA_MIGRATIONS_TABLE,
  });

  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: "user-jaime",
      email: "jaime@example.com",
      emailVerified: true,
      name: "Jaime",
    })
    .returning();
  await db.insert(schema.workspaceTable).values({
    id: "workspace-1",
    createdAt: new Date(),
    name: "Intelia",
    slug: "intelia",
  });
  const [project] = await db
    .insert(schema.projectTable)
    .values({
      workspaceId: "workspace-1",
      name: "SF",
      icon: "Folder",
      slug: "sf",
    })
    .returning();
  for (const column of DEFAULT_PROJECT_COLUMNS) {
    await db.insert(schema.columnTable).values({
      projectId: project!.id,
      name: column.name,
      slug: column.slug,
      position: column.position,
      isFinal: column.isFinal,
    });
  }
  // A legacy project without columns: upstream's migrateColumns() gives it the
  // default ones (only `done` final) after this migration has run.
  const [legacy] = await db
    .insert(schema.projectTable)
    .values({
      workspaceId: "workspace-1",
      name: "Legacy",
      icon: "Folder",
      slug: "legacy",
    })
    .returning();
  const seeded = [
    { projectId: project!.id, status: "to-do" },
    { projectId: project!.id, status: "in-progress" },
    { projectId: project!.id, status: "blocked-unknown-column" },
    { projectId: project!.id, status: "done" },
    { projectId: legacy!.id, status: "to-do" },
    { projectId: legacy!.id, status: "done" },
  ];
  const tasks = await db
    .insert(schema.taskTable)
    .values(
      seeded.map(({ projectId, status }, index) => ({
        projectId,
        title: status,
        number: index + 1,
        status,
        userId: user!.id,
      })),
    )
    .returning();
  const idOf = (projectId: string, status: string) =>
    tasks.find(
      (task) => task.projectId === projectId && task.status === status,
    )!.id;

  // The upgrade: the backfill runs once, at startup.
  writeFileSync(journalPath, fullJournal);
  await migrateInteliaSchema(db, inteliaFolder);
  await migrateInteliaSchema(db, inteliaFolder);

  const levels = await db.select().from(taskAutomationTable);
  expect(levels.map((row) => row.taskId).sort()).toEqual(
    [
      idOf(project!.id, "to-do"),
      idOf(project!.id, "in-progress"),
      idOf(project!.id, "blocked-unknown-column"),
      idOf(legacy!.id, "to-do"),
    ].sort(),
  );
  for (const row of levels) {
    expect(row).toMatchObject({
      level: "manual",
      verification: true,
      source: "migration",
      setByUserId: null,
      setByActor: null,
    });
  }
  const log = await db.select().from(taskAutomationChangeTable);
  expect(log).toHaveLength(4);
  for (const row of log) {
    expect(row).toMatchObject({
      previousLevel: null,
      previousVerification: null,
      level: "manual",
      verification: true,
      source: "migration",
    });
  }
});
