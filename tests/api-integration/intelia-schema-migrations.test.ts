// Intelia fork: our tables live in the "intelia" schema with their own journal
// and migrator (README-INTELIA.md, «Base de datos»). This replays the API
// startup order (upstream's Drizzle migrator, then ours) on a dedicated
// database, then simulates merging an upstream release that ships a new
// migration.
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
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import {
  INTELIA_MIGRATIONS_TABLE,
  migrateInteliaSchema,
} from "../../apps/api/src/intelia/migrate";

type Journal = {
  version: string;
  dialect: string;
  entries: Array<{
    idx: number;
    version: string;
    when: number;
    tag: string;
    breakpoints: boolean;
  }>;
};

const apiDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../apps/api",
);
// Later than anything upstream will ship: in a shared journal, Drizzle would
// skip every upstream migration older than this.
const FUTURE_WHEN = Date.UTC(2100, 0, 1);

let workDir: string;
let upstreamFolder: string;
let inteliaFolder: string;
let adminUrl: string;
let databaseName: string;
let pool: Pool;
let db: NodePgDatabase;

function readJournal(folder: string): Journal {
  return JSON.parse(
    readFileSync(join(folder, "meta", "_journal.json"), "utf8"),
  );
}

function appendMigration(
  folder: string,
  tag: string,
  when: number,
  statement: string,
) {
  const journal = readJournal(folder);
  writeFileSync(join(folder, `${tag}.sql`), statement);
  journal.entries.push({
    idx: journal.entries.length,
    version: journal.version,
    when,
    tag,
    breakpoints: true,
  });
  writeFileSync(
    join(folder, "meta", "_journal.json"),
    JSON.stringify(journal, null, 2),
  );
}

// Same order as runStartupTasks in apps/api/src/index.ts.
async function runStartupMigrations() {
  await migrate(db, { migrationsFolder: upstreamFolder });
  await migrateInteliaSchema(db, inteliaFolder);
}

async function tableExists(qualifiedName: string) {
  const result = await db.execute<{ oid: string | null }>(
    sql`SELECT to_regclass(${qualifiedName})::text AS oid`,
  );
  return result.rows[0]?.oid !== null;
}

async function appliedCount(schema: string, table: string) {
  const result = await db.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM ${sql.identifier(schema)}.${sql.identifier(table)}`,
  );
  return result.rows[0]?.count;
}

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
  databaseName = `${baseUrl.pathname.replace(/^\//, "").replace(/_test$/, "")}_intelia_migrations_test`;
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

  // Work on copies: the simulated merge appends to both journals.
  workDir = mkdtempSync(join(tmpdir(), "intelia-migrations-"));
  upstreamFolder = join(workDir, "drizzle");
  inteliaFolder = join(workDir, "drizzle-intelia");
  cpSync(join(apiDir, "drizzle"), upstreamFolder, { recursive: true });
  cpSync(join(apiDir, "drizzle-intelia"), inteliaFolder, { recursive: true });
});

afterAll(async () => {
  await pool?.end();
  if (workDir) {
    rmSync(workDir, { recursive: true, force: true });
  }
  if (adminUrl) {
    await withAdminClient(async (client) => {
      await client.query(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
    });
  }
});

it("creates an intelia migration's table in the intelia schema without touching upstream's journal", async () => {
  appendMigration(
    inteliaFolder,
    "9000_probe",
    FUTURE_WHEN,
    `CREATE TABLE "intelia"."migration_probe" (
  "id" text PRIMARY KEY NOT NULL,
  "comment_id" text NOT NULL REFERENCES "public"."comment"("id") ON DELETE CASCADE
);`,
  );

  await runStartupMigrations();

  expect(await tableExists("intelia.migration_probe")).toBe(true);
  expect(await tableExists("public.migration_probe")).toBe(false);
  expect(await appliedCount("drizzle", "__drizzle_migrations")).toBe(
    readJournal(upstreamFolder).entries.length,
  );
  expect(await appliedCount("intelia", INTELIA_MIGRATIONS_TABLE)).toBe(
    readJournal(inteliaFolder).entries.length,
  );

  // A restart with nothing new is a no-op.
  await runStartupMigrations();
  expect(await appliedCount("intelia", INTELIA_MIGRATIONS_TABLE)).toBe(
    readJournal(inteliaFolder).entries.length,
  );
});

it("applies both upstream's and intelia's new migrations after merging an upstream release", async () => {
  const upstreamEntries = readJournal(upstreamFolder).entries;
  const lastUpstreamWhen = upstreamEntries.at(-1)?.when ?? 0;
  // Upstream's new migration is older than our latest one: with a shared
  // journal Drizzle would skip it.
  expect(lastUpstreamWhen + 1).toBeLessThan(FUTURE_WHEN);
  appendMigration(
    upstreamFolder,
    `${String(upstreamEntries.length).padStart(4, "0")}_upstream_release`,
    lastUpstreamWhen + 1,
    `CREATE TABLE "upstream_release_probe" ("id" text PRIMARY KEY NOT NULL);`,
  );
  appendMigration(
    inteliaFolder,
    "9001_after_merge",
    FUTURE_WHEN + 1,
    `ALTER TABLE "intelia"."migration_probe" ADD COLUMN "emoji" text;`,
  );

  await runStartupMigrations();

  expect(await tableExists("public.upstream_release_probe")).toBe(true);
  const columns = await db.execute<{ column_name: string }>(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'intelia' AND table_name = 'migration_probe'
  `);
  expect(columns.rows.map((row) => row.column_name)).toContain("emoji");
  expect(await appliedCount("drizzle", "__drizzle_migrations")).toBe(
    readJournal(upstreamFolder).entries.length,
  );
  expect(await appliedCount("intelia", INTELIA_MIGRATIONS_TABLE)).toBe(
    readJournal(inteliaFolder).entries.length,
  );
});
