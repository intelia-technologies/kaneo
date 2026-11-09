import { eq, sql } from "drizzle-orm";
import db from "../../database";
import { dataMigrationTable } from "../../database/schema";
import { REQUESTED_COLUMN_NAME, REQUESTED_STATUS } from "./status";

const COMPLETION_ID = "intelia-requested-column-v1";

// «Pedida» in every existing project (design 52 §3.2): before Backlog if the
// project has one, first otherwise. Runs once, at startup, after upstream's
// column migration (migrateColumns): that one seeds legacy projects without
// columns with its own four, so here they get «Pedida» too, and a project
// still without columns (upstream's migration already done) gets it alone.
// Migration 0014 covers the projects that had columns before this startup.
// Once done it does not run again: a «Pedida» deleted later stays deleted.
// Safe with several replicas (advisory lock, marker in the same transaction).
export async function ensureRequestedColumns() {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('intelia.requested_columns'))`,
    );
    const [done] = await tx
      .select({ id: dataMigrationTable.id })
      .from(dataMigrationTable)
      .where(eq(dataMigrationTable.id, COMPLETION_ID));
    if (done) return;
    await tx.execute(sql`
      WITH "target" AS (
        SELECT "p"."id" AS "project_id",
          coalesce(
            (SELECT min("b"."position") FROM "public"."column" AS "b"
              WHERE "b"."project_id" = "p"."id" AND "b"."slug" = 'backlog'),
            0
          ) AS "position"
        FROM "public"."project" AS "p"
        WHERE NOT EXISTS (
          SELECT 1 FROM "public"."column" AS "c"
          WHERE "c"."project_id" = "p"."id" AND "c"."slug" = ${REQUESTED_STATUS}
        )
      ), "shifted" AS (
        UPDATE "public"."column" AS "c"
        SET "position" = "c"."position" + 1
        FROM "target" AS "t"
        WHERE "c"."project_id" = "t"."project_id" AND "c"."position" >= "t"."position"
        RETURNING "c"."id"
      )
      INSERT INTO "public"."column" ("id", "project_id", "name", "slug", "position", "is_final")
      SELECT gen_random_uuid()::text, "t"."project_id", ${REQUESTED_COLUMN_NAME},
        ${REQUESTED_STATUS}, "t"."position", false
      FROM "target" AS "t"`);
    await tx.insert(dataMigrationTable).values({ id: COMPLETION_ID });
  });
}
