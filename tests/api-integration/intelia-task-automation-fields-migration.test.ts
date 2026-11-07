// Migration 0013_task_automation_fields (design 48 §3.2, NU-01k): the tasks
// that already have a level when it runs. Replays the API startup on a
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
import { migrateInteliaSchema } from "../../apps/api/src/intelia/migrate";
import {
  taskAutomationChangeTable,
  taskAutomationTable,
} from "../../apps/api/src/intelia/schema";

const apiDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../apps/api",
);
const FIELDS_TAG = "0013_task_automation_fields";

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
  databaseName = `${baseUrl.pathname.replace(/^\//, "").replace(/_test$/, "")}_intelia_fields_test`;
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

  workDir = mkdtempSync(join(tmpdir(), "intelia-fields-"));
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

it("translates manual to automatica no and arranque and completa to yes, keeps the verification, fills the delivery by type and the log", async () => {
  // The deployed schema: every intelia migration before this one.
  const journalPath = join(inteliaFolder, "meta", "_journal.json");
  const fullJournal = readFileSync(journalPath, "utf8");
  const journal = JSON.parse(fullJournal) as {
    entries: Array<{ tag: string }>;
  };
  const fieldsIndex = journal.entries.findIndex(
    (entry) => entry.tag === FIELDS_TAG,
  );
  expect(fieldsIndex).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, fieldsIndex);
  writeFileSync(journalPath, JSON.stringify(journal));
  await migrate(db, { migrationsFolder: join(apiDir, "drizzle") });
  await migrateInteliaSchema(db, inteliaFolder);

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
  // One task per level and type; `paused` is one of the 06-nov pause, which
  // this migration does not know: it only translates its level.
  const seeded = [
    { id: "t-manual", level: "manual", verification: true, type: "operacion" },
    {
      id: "t-arranque",
      level: "arranque",
      verification: false,
      type: "implementacion",
    },
    {
      id: "t-completa",
      level: "completa",
      verification: true,
      type: "validacion",
    },
    { id: "t-diseno", level: "arranque", verification: true, type: "diseno" },
    { id: "t-untyped", level: "manual", verification: false, type: null },
  ];
  await db.insert(schema.taskTable).values(
    seeded.map(({ id }, index) => ({
      id,
      projectId: project!.id,
      title: id,
      number: index + 1,
      status: "to-do",
    })),
  );
  // Raw SQL: the Drizzle schema already has the new columns.
  for (const { id, level, verification, type } of seeded) {
    await pool.query(
      `INSERT INTO intelia.task_automation (task_id, level, verification, source) VALUES ($1, $2, $3, 'session')`,
      [id, level, verification],
    );
    await pool.query(
      `INSERT INTO intelia.task_automation_change (id, task_id, previous_level, previous_verification, level, verification, source) VALUES ($1, $2, NULL, NULL, 'manual', true, 'session'), ($3, $2, 'manual', true, $4, $5, 'session')`,
      [`${id}-1`, id, `${id}-2`, level, verification],
    );
    if (type) {
      await pool.query(
        `INSERT INTO intelia.task_classification (task_id, type, validation_in_production, validation_in_production_reason) VALUES ($1, $2, $3, $4)`,
        [
          id,
          type,
          type === "implementacion" || type === "operacion"
            ? "no_aplica"
            : null,
          type === "implementacion" || type === "operacion" ? "test" : null,
        ],
      );
    }
  }

  // The upgrade, twice: the second startup changes nothing.
  writeFileSync(journalPath, fullJournal);
  await migrateInteliaSchema(db, inteliaFolder);
  await migrateInteliaSchema(db, inteliaFolder);

  const rows = await db.select().from(taskAutomationTable);
  const byId = new Map(rows.map((row) => [row.taskId, row]));
  const empty = {
    pausaMotivo: null,
    responsable: null,
    implementador: null,
    verificador: null,
    columnaPrevia: null,
    source: "session",
  };
  expect(byId.get("t-manual")).toMatchObject({
    ...empty,
    level: "manual",
    automatica: false,
    verification: true,
    entrega: "sin_pr",
  });
  expect(byId.get("t-arranque")).toMatchObject({
    ...empty,
    level: "arranque",
    automatica: true,
    verification: false,
    entrega: "pr",
  });
  expect(byId.get("t-completa")).toMatchObject({
    ...empty,
    level: "completa",
    automatica: true,
    verification: true,
    entrega: "sin_pr",
  });
  // A design's delivery is its designer's to decide; an untyped task has none.
  expect(byId.get("t-diseno")).toMatchObject({
    automatica: true,
    entrega: null,
  });
  expect(byId.get("t-untyped")).toMatchObject({
    automatica: false,
    verification: false,
    entrega: null,
  });

  // The log reads the same way: each level as its automatica.
  const log = await db.select().from(taskAutomationChangeTable);
  expect(log).toHaveLength(seeded.length * 2);
  for (const row of log) {
    expect(row.automatica).toBe(row.level !== "manual");
    expect(row.previousAutomatica).toBe(
      row.previousLevel === null ? null : row.previousLevel !== "manual",
    );
    expect(row.pausaMotivo).toBeNull();
    expect(row.entrega).toBeNull();
  }

  // The checks hold from now on: the level and automatica are tied, and a
  // pause needs automatica off and a reason.
  for (const statement of [
    `UPDATE intelia.task_automation SET automatica = true WHERE task_id = 't-manual'`,
    `UPDATE intelia.task_automation SET level = 'manual' WHERE task_id = 't-arranque'`,
    `UPDATE intelia.task_automation SET pausa_motivo = 'movida_a_mano' WHERE task_id = 't-arranque'`,
    `UPDATE intelia.task_automation SET pausa_motivo = '  ' WHERE task_id = 't-manual'`,
    `UPDATE intelia.task_automation SET entrega = 'otra' WHERE task_id = 't-manual'`,
  ]) {
    await expect(pool.query(statement)).rejects.toMatchObject({
      code: "23514",
    });
  }
  await pool.query(
    `UPDATE intelia.task_automation SET pausa_motivo = 'movida_a_mano' WHERE task_id = 't-manual'`,
  );
});
