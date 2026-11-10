-- Design 53 §3.2 (KF-4): archiving is a mark apart from the status.
CREATE TABLE "intelia"."task_archive" (
	"task_id" text PRIMARY KEY NOT NULL,
	"archived_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"archived_by_user_id" text
);--> statement-breakpoint
ALTER TABLE "intelia"."task_archive" ADD CONSTRAINT "task_archive_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."task_archive" ADD CONSTRAINT "task_archive_archived_by_user_id_user_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE TABLE "intelia"."task_archive_migration_skip" (
	"task_id" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL CHECK ("reason" IN ('no_history', 'not_a_closed_column')),
	"old_status" text,
	"recorded_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);--> statement-breakpoint
ALTER TABLE "intelia"."task_archive_migration_skip" ADD CONSTRAINT "task_archive_migration_skip_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
-- Tasks in upstream's virtual `archived` status go back to the closed column
-- they came from, with the mark dated at the archive. The origin is the
-- `oldStatus` of the task's latest `status_changed` to `archived`. Without that
-- row, or when its `oldStatus` is not a final column of the task's project
-- (archived from To do, or a column since removed), the task stays as it is,
-- without mark, and is recorded in task_archive_migration_skip for a person
-- to review: a cancelled task must never end up done and satisfy a dependency.
CREATE TEMPORARY TABLE "task_archive_origin" AS
SELECT "t"."id" AS "task_id",
	"a"."old_status",
	"a"."created_at" AS "archived_at",
	"c"."id" AS "column_id"
FROM "public"."task" AS "t"
LEFT JOIN LATERAL (
	SELECT "x"."event_data"->>'oldStatus' AS "old_status", "x"."created_at"
	FROM "public"."activity" AS "x"
	WHERE "x"."task_id" = "t"."id"
		AND "x"."type" = 'status_changed'
		AND "x"."event_data"->>'newStatus' = 'archived'
	ORDER BY "x"."created_at" DESC, "x"."id" DESC
	LIMIT 1
) AS "a" ON true
LEFT JOIN LATERAL (
	SELECT "y"."id"
	FROM "public"."column" AS "y"
	WHERE "y"."project_id" = "t"."project_id"
		AND "y"."slug" = "a"."old_status"
		AND "y"."is_final" = true
	ORDER BY "y"."position", "y"."id"
	LIMIT 1
) AS "c" ON true
WHERE "t"."status" = 'archived';--> statement-breakpoint
INSERT INTO "intelia"."task_archive_migration_skip" ("task_id", "reason", "old_status")
SELECT "task_id",
	CASE WHEN "archived_at" IS NULL THEN 'no_history' ELSE 'not_a_closed_column' END,
	"old_status"
FROM "task_archive_origin"
WHERE "column_id" IS NULL
ON CONFLICT ("task_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "intelia"."task_archive" ("task_id", "archived_at")
SELECT "task_id", "archived_at"
FROM "task_archive_origin"
WHERE "column_id" IS NOT NULL
ON CONFLICT ("task_id") DO NOTHING;--> statement-breakpoint
UPDATE "public"."task" AS "t"
SET "status" = "o"."old_status", "column_id" = "o"."column_id"
FROM "task_archive_origin" AS "o"
WHERE "t"."id" = "o"."task_id"
	AND "o"."column_id" IS NOT NULL
	AND "t"."status" = 'archived';--> statement-breakpoint
-- The report to check against the tasks archived by hand: how many went back
-- to each closed status and how many were skipped (the list is in
-- task_archive_migration_skip). One row, also sent as a NOTICE.
CREATE TABLE "intelia"."task_archive_migration_report" (
	"ran_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"restored" jsonb NOT NULL,
	"skipped" integer NOT NULL
);--> statement-breakpoint
INSERT INTO "intelia"."task_archive_migration_report" ("restored", "skipped")
SELECT coalesce(
		(SELECT jsonb_object_agg("old_status", "n") FROM (
			SELECT "old_status", count(*)::int AS "n" FROM "task_archive_origin"
			WHERE "column_id" IS NOT NULL GROUP BY "old_status"
		) AS "r"),
		'{}'::jsonb
	),
	(SELECT count(*)::int FROM "task_archive_origin" WHERE "column_id" IS NULL);--> statement-breakpoint
DO $$
DECLARE r record;
BEGIN
	SELECT * INTO r FROM "intelia"."task_archive_migration_report" LIMIT 1;
	RAISE NOTICE 'intelia 0016: restored %, skipped % (see intelia.task_archive_migration_skip)', r.restored, r.skipped;
END;
$$;--> statement-breakpoint
DROP TABLE "task_archive_origin";
