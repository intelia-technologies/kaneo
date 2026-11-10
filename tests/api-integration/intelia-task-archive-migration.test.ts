// Migration 0016_task_archive (design 53 §3.2, KF-4): tasks archived with
// upstream's virtual `archived` status go back to the closed column they came
// from, with the archive mark dated at their archive. Tasks whose history does
// not say so stay as they are and are listed for review. Replays the API
// startup on a dedicated database, first without the migration (the deployed
// schema) and then with it, as an upgrade would.
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
import type appDb from "../../apps/api/src/database";
import { schema } from "../../apps/api/src/database";
import {
  migrateInteliaJournal,
  migrateInteliaSchema,
} from "../../apps/api/src/intelia/migrate";
import { assertNoPendingBlockersOnTransition } from "../../apps/api/src/task/controllers/assert-no-pending-blockers-on-transition";

const apiDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../apps/api",
);
const ARCHIVE_TAG = "0016_task_archive";

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
  databaseName = `${baseUrl.pathname.replace(/^\//, "").replace(/_test$/, "")}_intelia_archive_test`;
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

  workDir = mkdtempSync(join(tmpdir(), "intelia-archive-"));
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

it("restores archived tasks to their closed column with the mark, and lists the ones it cannot", async () => {
  const journalPath = join(inteliaFolder, "meta", "_journal.json");
  const fullJournal = readFileSync(journalPath, "utf8");
  const journal = JSON.parse(fullJournal) as {
    entries: Array<{ tag: string; when: number }>;
  };
  const archiveIndex = journal.entries.findIndex(
    (entry) => entry.tag === ARCHIVE_TAG,
  );
  expect(archiveIndex).toBeGreaterThan(0);
  expect(journal.entries[archiveIndex]!.when).toBeGreaterThan(
    journal.entries[archiveIndex - 1]!.when,
  );
  journal.entries = journal.entries.slice(0, archiveIndex);
  writeFileSync(journalPath, JSON.stringify(journal));
  await migrate(db, { migrationsFolder: join(apiDir, "drizzle") });
  // The deployed schema, without the startup check: today's code expects the
  // foreign keys of task_archive, which only 0016 creates.
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
  const columns = await db
    .insert(schema.columnTable)
    .values(
      ["to-do", "in-progress", "done", "cancelled"].map((slug, position) => ({
        projectId: project!.id,
        name: slug,
        slug,
        position,
        isFinal: slug === "done" || slug === "cancelled",
      })),
    )
    .returning();
  const columnId = (slug: string) => columns.find((c) => c.slug === slug)!.id;

  let number = 1;
  const task = async (status: string) => {
    const [row] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project!.id,
        title: `Tarea ${number}`,
        number: number++,
        status,
        columnId: status === "archived" ? null : columnId(status),
      })
      .returning();
    return row!;
  };
  const change = (
    taskId: string,
    oldStatus: string,
    newStatus: string,
    createdAt: Date,
  ) =>
    db.insert(schema.activityTable).values({
      taskId,
      type: "status_changed",
      eventData: { oldStatus, newStatus },
      createdAt,
    });

  const archivedAt = new Date("2026-11-09T19:53:00.000Z");
  const fromDone = await task("archived");
  await change(
    fromDone.id,
    "in-progress",
    "done",
    new Date("2026-11-08T10:00:00Z"),
  );
  await change(fromDone.id, "done", "archived", archivedAt);
  const fromCancelled = await task("archived");
  // Archived, restored and archived again: the latest archive wins.
  await change(
    fromCancelled.id,
    "done",
    "archived",
    new Date("2026-11-01T10:00:00Z"),
  );
  await change(
    fromCancelled.id,
    "archived",
    "cancelled",
    new Date("2026-11-02T10:00:00Z"),
  );
  await change(fromCancelled.id, "cancelled", "archived", archivedAt);
  const noHistory = await task("archived");
  const fromOpen = await task("archived");
  await change(fromOpen.id, "to-do", "archived", archivedAt);
  const untouched = await task("done");
  const dependents = {
    ofDone: await task("to-do"),
    ofCancelled: await task("to-do"),
    ofNoHistory: await task("to-do"),
  };
  await db.insert(schema.taskRelationTable).values([
    {
      sourceTaskId: fromDone.id,
      targetTaskId: dependents.ofDone.id,
      relationType: "blocks",
    },
    {
      sourceTaskId: fromCancelled.id,
      targetTaskId: dependents.ofCancelled.id,
      relationType: "blocks",
    },
    {
      sourceTaskId: noHistory.id,
      targetTaskId: dependents.ofNoHistory.id,
      relationType: "blocks",
    },
  ]);

  writeFileSync(journalPath, fullJournal);
  await migrateInteliaSchema(db, inteliaFolder);

  const { rows: tasks } = await pool.query(
    `SELECT t.id, t.status, t.column_id, a.archived_at::text AS archived_at
       FROM task t LEFT JOIN intelia.task_archive a ON a.task_id = t.id`,
  );
  const byId = new Map(tasks.map((row) => [row.id, row]));
  expect(byId.get(fromDone.id)).toMatchObject({
    status: "done",
    column_id: columnId("done"),
    archived_at: "2026-11-09 19:53:00",
  });
  expect(byId.get(fromCancelled.id)).toMatchObject({
    status: "cancelled",
    column_id: columnId("cancelled"),
    archived_at: "2026-11-09 19:53:00",
  });
  for (const left of [noHistory, fromOpen]) {
    expect(byId.get(left.id)).toMatchObject({
      status: "archived",
      column_id: null,
      archived_at: null,
    });
  }
  expect(byId.get(untouched.id)).toMatchObject({
    status: "done",
    archived_at: null,
  });

  const { rows: skipped } = await pool.query(
    `SELECT task_id, reason, old_status FROM intelia.task_archive_migration_skip ORDER BY task_id`,
  );
  expect(skipped).toEqual(
    [
      { task_id: noHistory.id, reason: "no_history", old_status: null },
      {
        task_id: fromOpen.id,
        reason: "not_a_closed_column",
        old_status: "to-do",
      },
    ].sort((a, b) => a.task_id.localeCompare(b.task_id)),
  );
  const { rows: report } = await pool.query(
    `SELECT restored, skipped FROM intelia.task_archive_migration_report`,
  );
  expect(report).toEqual([{ restored: { done: 1, cancelled: 1 }, skipped: 2 }]);

  // Dependencies read the restored status: the task archived from done frees
  // its dependent; the ones from cancelled and without history still block.
  const tryStart = (dependent: { id: string; status: string }) =>
    db.transaction((tx) =>
      assertNoPendingBlockersOnTransition(
        tx as unknown as Parameters<Parameters<typeof appDb.transaction>[0]>[0],
        [dependent],
        "in-progress",
      ),
    );
  await expect(tryStart(dependents.ofDone)).resolves.toBeUndefined();
  await expect(tryStart(dependents.ofCancelled)).rejects.toMatchObject({
    status: 409,
  });
  await expect(tryStart(dependents.ofNoHistory)).rejects.toMatchObject({
    status: 409,
  });

  // A second startup changes nothing.
  await migrateInteliaSchema(db, inteliaFolder);
  const { rows: again } = await pool.query(
    `SELECT t.id, t.status, t.column_id, a.archived_at::text AS archived_at
       FROM task t LEFT JOIN intelia.task_archive a ON a.task_id = t.id`,
  );
  expect(new Map(again.map((row) => [row.id, row]))).toEqual(byId);
});
