import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { INTELIA_SCHEMA } from "./schema";
import { assertTaskHooks, installTaskHooks } from "./task-hooks";

export const INTELIA_MIGRATIONS_TABLE = "__intelia_migrations";

// Intelia fork: applies apps/api/drizzle-intelia with its own journal and its
// own bookkeeping table (intelia.__intelia_migrations). Upstream's journal
// (apps/api/drizzle/meta/_journal.json) and drizzle.__drizzle_migrations are
// never touched, so merging upstream releases cannot make Drizzle skip their
// migrations. Must run after upstream's migrator: our tables may reference
// theirs. Then, on every startup, it reinstalls our trigger on upstream's
// `task` and refuses to go on if a hook is missing (./task-hooks.ts).
export async function migrateInteliaSchema<
  TSchema extends Record<string, unknown>,
>(db: NodePgDatabase<TSchema>, migrationsFolder: string): Promise<void> {
  await migrate(db, {
    migrationsFolder,
    migrationsSchema: INTELIA_SCHEMA,
    migrationsTable: INTELIA_MIGRATIONS_TABLE,
  });
  await installTaskHooks(db);
  await assertTaskHooks(db);
}
