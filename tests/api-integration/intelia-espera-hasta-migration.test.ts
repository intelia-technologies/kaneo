// Migration 0019_espera_hasta (design 80 §4.4, BC-06): the automations that
// already exist when it runs. Replays the API startup on a dedicated database,
// first without that migration (the deployed schema) and then with it, as an
// upgrade would.
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
  migrateInteliaJournal,
  migrateInteliaSchema,
} from "../../apps/api/src/intelia/migrate";
import { taskAutomationTable } from "../../apps/api/src/intelia/schema";

const apiDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../apps/api",
);
const TAG = "0019_espera_hasta";

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
  databaseName = `${baseUrl.pathname.replace(/^\//, "").replace(/_test$/, "")}_intelia_espera_hasta_test`;
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

  workDir = mkdtempSync(join(tmpdir(), "intelia-espera-hasta-"));
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

it("adds a null `espera_hasta` to the existing automations, keeps the rest, and stores an instant", async () => {
  // The deployed schema: every intelia migration before this one.
  const journalPath = join(inteliaFolder, "meta", "_journal.json");
  const fullJournal = readFileSync(journalPath, "utf8");
  const journal = JSON.parse(fullJournal) as {
    entries: Array<{ tag: string; when: number }>;
  };
  const index = journal.entries.findIndex((entry) => entry.tag === TAG);
  // Drizzle only applies entries newer than the last applied one.
  expect(index).toBe(journal.entries.length - 1);
  expect(journal.entries[index]!.when).toBeGreaterThan(
    journal.entries[index - 1]!.when,
  );
  journal.entries = journal.entries.slice(0, index);
  writeFileSync(journalPath, JSON.stringify(journal));
  await migrate(db, { migrationsFolder: join(apiDir, "drizzle") });
  await migrateInteliaJournal(db, inteliaFolder);

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
  await pool.query(
    `INSERT INTO task (id, project_id, title, number, status)
     VALUES ('t-blocked', $1, 't-blocked', 1, 'blocked')`,
    [project!.id],
  );
  // Raw SQL: the Drizzle schema already has the new column.
  await pool.query(
    `INSERT INTO intelia.task_automation (task_id, level, verification, source, automatica, entrega, responsable, columna_previa)
     VALUES ('t-blocked', 'arranque', true, 'session', true, 'pr', 'agent:forja', 'in-progress')`,
  );

  // The upgrade, twice: the second startup changes nothing.
  writeFileSync(journalPath, fullJournal);
  await migrateInteliaSchema(db, inteliaFolder);
  await migrateInteliaSchema(db, inteliaFolder);

  const [row] = await db.select().from(taskAutomationTable);
  expect(row).toMatchObject({
    taskId: "t-blocked",
    level: "arranque",
    automatica: true,
    entrega: "pr",
    responsable: "agent:forja",
    columnaPrevia: "in-progress",
    esperaHasta: null,
  });

  // An instant with an offset reads back as the same instant.
  await pool.query(
    `UPDATE intelia.task_automation SET espera_hasta = '2026-11-30T10:00:00+01:00' WHERE task_id = 't-blocked'`,
  );
  const [updated] = await db.select().from(taskAutomationTable);
  expect(updated!.esperaHasta?.toISOString()).toBe("2026-11-30T09:00:00.000Z");
});
