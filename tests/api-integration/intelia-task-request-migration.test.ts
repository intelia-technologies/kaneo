// Migration 0014_task_request (design 52 §3.2, IM-04): the projects that
// already exist when it runs get the «Pedida» column, before Backlog if they
// have one and first otherwise. Replays the API startup on a dedicated
// database, first without that migration (the deployed schema) and then with
// it, as an upgrade would.
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
import { asc, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { schema } from "../../apps/api/src/database";
import {
  migrateInteliaJournal,
  migrateInteliaSchema,
} from "../../apps/api/src/intelia/migrate";

const apiDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../apps/api",
);
const REQUEST_TAG = "0014_task_request";

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
  databaseName = `${baseUrl.pathname.replace(/^\//, "").replace(/_test$/, "")}_intelia_request_test`;
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

  workDir = mkdtempSync(join(tmpdir(), "intelia-request-"));
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

async function boardOf(projectId: string) {
  const columns = await db
    .select({
      slug: schema.columnTable.slug,
      name: schema.columnTable.name,
      position: schema.columnTable.position,
      isFinal: schema.columnTable.isFinal,
    })
    .from(schema.columnTable)
    .where(eq(schema.columnTable.projectId, projectId))
    .orderBy(asc(schema.columnTable.position));
  return columns;
}

it("adds «Pedida» to every existing project, before Backlog or first, once", async () => {
  const journalPath = join(inteliaFolder, "meta", "_journal.json");
  const fullJournal = readFileSync(journalPath, "utf8");
  const journal = JSON.parse(fullJournal) as {
    entries: Array<{ tag: string; when: number }>;
  };
  for (const [i, entry] of journal.entries.entries()) {
    if (i > 0) {
      expect(entry.when).toBeGreaterThan(journal.entries[i - 1]!.when);
    }
  }
  const requestIndex = journal.entries.findIndex(
    (entry) => entry.tag === REQUEST_TAG,
  );
  expect(requestIndex).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, requestIndex);
  writeFileSync(journalPath, JSON.stringify(journal));
  await migrate(db, { migrationsFolder: join(apiDir, "drizzle") });
  // The deployed schema, without the startup check: today's code expects the
  // foreign key of task_request, which only 0014 creates.
  await migrateInteliaJournal(db, inteliaFolder);

  await db.insert(schema.workspaceTable).values({
    id: "workspace-1",
    createdAt: new Date(),
    name: "Intelia",
    slug: "intelia",
  });
  const project = async (slug: string, columns: string[]) => {
    const [row] = await db
      .insert(schema.projectTable)
      .values({ workspaceId: "workspace-1", name: slug, icon: "Folder", slug })
      .returning();
    if (columns.length > 0) {
      await db.insert(schema.columnTable).values(
        columns.map((column, position) => ({
          projectId: row!.id,
          name: column,
          slug: column,
          position,
          isFinal: column === "done" || column === "cancelled",
        })),
      );
    }
    return row!.id;
  };
  const withBacklog = await project("sf", [
    "design",
    "backlog",
    "to-do",
    "done",
    "cancelled",
  ]);
  const plain = await project("kf", ["to-do", "in-progress", "done"]);
  const empty = await project("empty", []);
  const already = await project("already", ["to-do", "pedida", "done"]);

  writeFileSync(journalPath, fullJournal);
  await migrateInteliaSchema(db, inteliaFolder);

  expect((await boardOf(withBacklog)).map((c) => [c.slug, c.position])).toEqual(
    [
      ["design", 0],
      ["pedida", 1],
      ["backlog", 2],
      ["to-do", 3],
      ["done", 4],
      ["cancelled", 5],
    ],
  );
  expect(await boardOf(plain)).toEqual([
    { slug: "pedida", name: "Pedida", position: 0, isFinal: false },
    { slug: "to-do", name: "to-do", position: 1, isFinal: false },
    { slug: "in-progress", name: "in-progress", position: 2, isFinal: false },
    { slug: "done", name: "done", position: 3, isFinal: true },
  ]);
  expect((await boardOf(empty)).map((c) => c.slug)).toEqual(["pedida"]);
  expect((await boardOf(already)).map((c) => c.slug)).toEqual([
    "to-do",
    "pedida",
    "done",
  ]);

  // The table is there, empty.
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM intelia.task_request`,
  );
  expect(rows[0].n).toBe(0);
});
