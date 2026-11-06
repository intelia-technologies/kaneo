// Intelia fork (SF-1134, KF-10): up to v2.48.0-intelia.18 the project-access
// operations table was created by apps/api/drizzle/0067_project_access_operations.sql,
// a migration of ours in upstream's journal. Upstream v2.49.0 ships its own
// 0067, so ours moved to drizzle-intelia/0012_project_access_operation.sql.
// This replays a database deployed with the old image, then starts the new
// one: upstream's 0067..0072 must still apply and the stored operations must
// survive in the intelia schema.
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
import { migrateInteliaSchema } from "../../apps/api/src/intelia/migrate";

type Journal = {
  entries: Array<{ idx: number; when: number; tag: string }>;
};

const apiDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../apps/api",
);

// The migration as v2.48.0-intelia.18 shipped it, with its journal entry.
const OLD_TAG = "0067_project_access_operations";
const OLD_WHEN = 1793038077477;
const OLD_SQL = `CREATE TABLE "project_access_operation" (
  "workspace_id" text NOT NULL,
  "user_id" text NOT NULL,
  "actor_id" text NOT NULL,
  "operation_id" uuid NOT NULL,
  "request" jsonb,
  "response" jsonb,
  CHECK (("request" IS NULL) = ("response" IS NULL)),
  PRIMARY KEY ("workspace_id", "user_id", "operation_id")
);`;
const NEW_TAG = "0012_project_access_operation";
const OPERATION_ID = "6f1c1c3e-8f0a-4c51-9a4e-0b7b1d2b9c11";

let workDir: string;
let adminUrl: string;
let databaseName: string;
let pool: Pool;
let db: NodePgDatabase;

function readJournal(folder: string): Journal {
  return JSON.parse(
    readFileSync(join(folder, "meta", "_journal.json"), "utf8"),
  );
}

function rewriteJournal(folder: string, edit: (journal: Journal) => void) {
  const journal = readJournal(folder);
  edit(journal);
  writeFileSync(
    join(folder, "meta", "_journal.json"),
    JSON.stringify(journal, null, 2),
  );
}

async function regclass(name: string) {
  const result = await db.execute<{ oid: string | null }>(
    sql`SELECT to_regclass(${name})::text AS oid`,
  );
  return result.rows[0]?.oid ?? null;
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
  databaseName = `${baseUrl.pathname.replace(/^\//, "").replace(/_test$/, "")}_project_access_move_test`;
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
  workDir = mkdtempSync(join(tmpdir(), "intelia-project-access-move-"));
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

it("keeps the stored operations and applies upstream v2.49.0's migrations when upgrading from v2.48.0-intelia.18", async () => {
  const upstreamFolder = join(apiDir, "drizzle");
  const inteliaFolder = join(apiDir, "drizzle-intelia");
  const upstreamEntries = readJournal(upstreamFolder).entries;
  const inteliaEntries = readJournal(inteliaFolder).entries;
  expect(upstreamEntries.some((entry) => entry.tag === OLD_TAG)).toBe(false);
  expect(inteliaEntries.at(-1)?.tag).toBe(NEW_TAG);
  // Upstream's new migrations must be newer than the old row in
  // drizzle.__drizzle_migrations, or Drizzle would skip them.
  const newUpstream = upstreamEntries.filter((entry) => entry.idx >= 67);
  expect(newUpstream.length).toBeGreaterThan(0);
  for (const entry of newUpstream) {
    expect(entry.when).toBeGreaterThan(OLD_WHEN);
  }

  // The database as the old image left it.
  const oldUpstream = join(workDir, "old-drizzle");
  const oldIntelia = join(workDir, "old-drizzle-intelia");
  cpSync(upstreamFolder, oldUpstream, { recursive: true });
  cpSync(inteliaFolder, oldIntelia, { recursive: true });
  writeFileSync(join(oldUpstream, `${OLD_TAG}.sql`), OLD_SQL);
  rewriteJournal(oldUpstream, (journal) => {
    const kept = journal.entries.filter((entry) => entry.idx < 67);
    const template = kept.at(-1);
    if (!template) throw new Error("upstream journal is empty");
    journal.entries = [
      ...kept,
      { ...template, idx: 67, when: OLD_WHEN, tag: OLD_TAG },
    ];
  });
  rewriteJournal(oldIntelia, (journal) => {
    journal.entries = journal.entries.filter((entry) => entry.tag !== NEW_TAG);
  });
  await migrate(db, { migrationsFolder: oldUpstream });
  await migrateInteliaSchema(db, oldIntelia);
  await db.execute(sql`INSERT INTO public.project_access_operation
    (workspace_id, user_id, actor_id, operation_id, request, response)
    VALUES ('ws', 'member', 'actor', ${OPERATION_ID}::uuid,
      '{"projectIds":["p1"]}'::jsonb, '{"reasignadas":2,"desasignadas":1}'::jsonb)`);

  // The new image starts: same order as runStartupTasks.
  await migrate(db, { migrationsFolder: upstreamFolder });
  await migrateInteliaSchema(db, inteliaFolder);

  expect(await regclass("public.project_access_operation")).toBeNull();
  const stored = await db.execute<{
    actor_id: string;
    request: unknown;
    response: unknown;
  }>(sql`SELECT actor_id, request, response
    FROM intelia.project_access_operation
    WHERE workspace_id = 'ws' AND user_id = 'member'
      AND operation_id = ${OPERATION_ID}::uuid`);
  expect(stored.rows).toEqual([
    {
      actor_id: "actor",
      request: { projectIds: ["p1"] },
      response: { reasignadas: 2, desasignadas: 1 },
    },
  ]);
  // The key and the check moved with the table.
  await expect(
    db.execute(sql`INSERT INTO intelia.project_access_operation
      (workspace_id, user_id, actor_id, operation_id, request, response)
      VALUES ('ws', 'member', 'other', ${OPERATION_ID}::uuid, NULL, NULL)`),
  ).rejects.toThrow();
  await expect(
    db.execute(sql`INSERT INTO intelia.project_access_operation
      (workspace_id, user_id, actor_id, operation_id, request, response)
      VALUES ('ws', 'member', 'actor', gen_random_uuid(), '{}'::jsonb, NULL)`),
  ).rejects.toThrow();

  // Upstream v2.49.0's migrations ran (0068 creates admin_audit_log).
  expect(await regclass("public.admin_audit_log")).not.toBeNull();
  const applied = await db.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`,
  );
  // Upstream's entries plus the orphaned row of our old 0067.
  expect(applied.rows[0]?.count).toBe(upstreamEntries.length + 1);
});
