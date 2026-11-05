import { is, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { taskTable } from "../database/schema";
import * as inteliaTables from "./schema";

// Our hooks on upstream's `public.task` (README-INTELIA.md, «Base de datos»):
// the trigger that closes an initiative's plan, and the foreign keys of our
// tables to `task`. An upstream migration that recreates `task` drops them
// both without error, so they are not left to a one-off migration:
// - the trigger is (re)installed on every startup, after migrating;
// - every startup then checks the catalog and refuses to start, naming what
//   is missing, if the trigger or one of the foreign keys is not there. The
//   foreign keys need the documented repair (README-INTELIA.md, «Si upstream
//   recrea public.task»), never an automatic one: they depend on the data.

export const CLOSE_PLAN_TRIGGER = "intelia_close_plan_on_start";

// The plan closes on its own when a task of the initiative reaches In progress
// (design 19 §4), inside the transaction that changes the status, whichever
// path writes it (API, bulk, reorder, integrations, routines). It takes the
// initiative's row lock, the same one the API takes to assign a task, so an
// assignment is ordered before or after the close, never across it.
const CLOSE_PLAN_FUNCTION = sql.raw(`
CREATE OR REPLACE FUNCTION "intelia"."close_plan_on_start"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	v_initiative text;
	v_at timestamp;
BEGIN
	SELECT "i"."id" INTO v_initiative
	FROM "intelia"."task_initiative" AS "ti"
	JOIN "intelia"."initiative" AS "i" ON "i"."id" = "ti"."initiative_id"
	WHERE "ti"."task_id" = NEW."id"
		AND "i"."project_id" = NEW."project_id"
		AND "i"."plan_closed_at" IS NULL;
	IF v_initiative IS NULL THEN
		RETURN NULL;
	END IF;
	-- Rechecked under the lock: another transaction may have closed it.
	PERFORM 1 FROM "intelia"."initiative"
	WHERE "id" = v_initiative AND "plan_closed_at" IS NULL
	FOR UPDATE;
	IF NOT FOUND THEN
		RETURN NULL;
	END IF;
	-- Strictly after the initiative's last log row, as the API writes them.
	SELECT greatest(
		date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'utc'),
		max("changed_at") + interval '1 millisecond'
	) INTO v_at
	FROM "intelia"."initiative_change"
	WHERE "initiative_id" = v_initiative;
	UPDATE "intelia"."initiative" SET "plan_closed_at" = v_at WHERE "id" = v_initiative;
	INSERT INTO "intelia"."initiative_change"
		("id", "initiative_id", "kind", "previous", "value", "task_id", "source", "changed_at")
	VALUES (
		gen_random_uuid()::text, v_initiative, 'plan_closed',
		'{"planClosedAt": null}'::jsonb,
		jsonb_build_object('planClosedAt', to_char(v_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
		NEW."id", 'auto', v_at
	);
	RETURN NULL;
END;
$$`);

const DROP_TRIGGER = sql.raw(
  `DROP TRIGGER IF EXISTS "${CLOSE_PLAN_TRIGGER}" ON "public"."task"`,
);

const CREATE_TRIGGER = sql.raw(`
CREATE TRIGGER "${CLOSE_PLAN_TRIGGER}"
AFTER UPDATE OF "status" ON "public"."task"
FOR EACH ROW
WHEN (NEW."status" = 'in-progress' AND OLD."status" IS DISTINCT FROM NEW."status")
EXECUTE FUNCTION "intelia"."close_plan_on_start"()`);

// Serialize membership removal with objective updates, even when the task was
// not the objective when the removal began. Covers cascaded task deletions too.
const OBJECTIVE_FUNCTION = sql.raw(`
CREATE OR REPLACE FUNCTION "intelia"."clear_departing_objective"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_objetivo text;
  v_at timestamp;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."initiative_id" IS NOT DISTINCT FROM NEW."initiative_id" THEN
    RETURN NEW;
  END IF;
  SELECT "objetivo" INTO v_objetivo FROM "intelia"."initiative"
    WHERE "id" = OLD."initiative_id" FOR UPDATE;
  IF FOUND AND v_objetivo = OLD."task_id" THEN
    SELECT greatest(
      date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'utc'),
      max("changed_at") + interval '1 millisecond'
    ) INTO v_at FROM "intelia"."initiative_change"
      WHERE "initiative_id" = OLD."initiative_id";
    UPDATE "intelia"."initiative" SET "objetivo" = NULL
      WHERE "id" = OLD."initiative_id";
    INSERT INTO "intelia"."initiative_change"
      ("id", "initiative_id", "kind", "previous", "value", "source", "changed_at")
    VALUES (gen_random_uuid()::text, OLD."initiative_id", 'updated',
      jsonb_build_object('objetivo', OLD."task_id"), '{"objetivo": null}'::jsonb,
      'auto', v_at);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$`);

const DROP_OBJECTIVE_TRIGGER = sql.raw(`
DROP TRIGGER IF EXISTS "intelia_clear_departing_objective" ON "intelia"."task_initiative"`);
const CREATE_OBJECTIVE_TRIGGER = sql.raw(`
CREATE TRIGGER "intelia_clear_departing_objective"
BEFORE DELETE OR UPDATE OF "initiative_id" ON "intelia"."task_initiative"
FOR EACH ROW
EXECUTE FUNCTION "intelia"."clear_departing_objective"()`);

/**
 * Installs the function and the trigger again, in one transaction: re-runnable
 * and safe with several replicas starting at once (an advisory lock orders
 * them). Runs after both migrators, on every startup.
 */
export async function installTaskHooks<TSchema extends Record<string, unknown>>(
  db: NodePgDatabase<TSchema>,
) {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('intelia.task_hooks'))`,
    );
    await tx.execute(CLOSE_PLAN_FUNCTION);
    await tx.execute(DROP_TRIGGER);
    await tx.execute(CREATE_TRIGGER);
    await tx.execute(OBJECTIVE_FUNCTION);
    await tx.execute(DROP_OBJECTIVE_TRIGGER);
    await tx.execute(CREATE_OBJECTIVE_TRIGGER);
  });
}

/** The foreign keys of our tables to `public.task`, from the Drizzle schema. */
export function expectedTaskForeignKeys(): string[] {
  const names: string[] = [];
  for (const value of Object.values(inteliaTables)) {
    if (!is(value, PgTable)) continue;
    for (const foreignKey of getTableConfig(value).foreignKeys) {
      if (foreignKey.reference().foreignTable === taskTable) {
        names.push(foreignKey.getName());
      }
    }
  }
  return names.sort();
}

/** What the catalog lacks of our hooks on `public.task` (empty when whole). */
export async function missingTaskHooks<TSchema extends Record<string, unknown>>(
  db: NodePgDatabase<TSchema>,
): Promise<string[]> {
  const triggers = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM pg_trigger
    WHERE tgrelid = to_regclass('public.task')
      AND tgname = ${CLOSE_PLAN_TRIGGER}
      AND NOT tgisinternal AND tgenabled <> 'D'`);
  const keys = await db.execute<{ name: string }>(sql`
    SELECT c.conname AS name FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.contype = 'f' AND n.nspname = 'intelia'
      AND c.confrelid = to_regclass('public.task')`);
  const present = new Set(keys.rows.map((row) => row.name));
  return [
    ...(triggers.rows[0]?.n ? [] : [`trigger ${CLOSE_PLAN_TRIGGER}`]),
    ...expectedTaskForeignKeys()
      .filter((name) => !present.has(name))
      .map((name) => `foreign key ${name}`),
  ];
}

/**
 * Fails the startup, before any traffic, if our hooks on `public.task` are
 * incomplete, naming each missing one.
 */
export async function assertTaskHooks<TSchema extends Record<string, unknown>>(
  db: NodePgDatabase<TSchema>,
) {
  const missing = await missingTaskHooks(db);
  if (missing.length === 0) return;
  throw new Error(
    `Intelia: public.task lacks ${missing.join(", ")}. An upstream migration probably recreated the table; follow README-INTELIA.md, «Si upstream recrea public.task», before starting Kaneo.`,
  );
}
