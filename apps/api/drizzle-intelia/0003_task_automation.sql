CREATE TABLE "intelia"."task_automation_change" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"previous_level" text,
	"previous_verification" boolean,
	"level" text NOT NULL,
	"verification" boolean NOT NULL,
	"changed_by_user_id" text,
	"changed_by_actor" text,
	"source" text NOT NULL,
	"changed_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "task_automation_change_level_check" CHECK ("level" in ('manual', 'arranque', 'completa')),
	CONSTRAINT "task_automation_change_source_check" CHECK ("source" in ('session', 'api_key', 'gateway', 'migration'))
);
--> statement-breakpoint
CREATE TABLE "intelia"."task_automation" (
	"task_id" text PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"verification" boolean NOT NULL,
	"set_by_user_id" text,
	"set_by_actor" text,
	"source" text NOT NULL,
	"set_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "task_automation_level_check" CHECK ("level" in ('manual', 'arranque', 'completa')),
	CONSTRAINT "task_automation_source_check" CHECK ("source" in ('session', 'api_key', 'gateway', 'migration')),
	CONSTRAINT "task_automation_completa_verification_check" CHECK ("level" <> 'completa' or "verification")
);
--> statement-breakpoint
ALTER TABLE "intelia"."task_automation_change" ADD CONSTRAINT "task_automation_change_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."task_automation_change" ADD CONSTRAINT "task_automation_change_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."task_automation" ADD CONSTRAINT "task_automation_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."task_automation" ADD CONSTRAINT "task_automation_set_by_user_id_user_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "task_automation_change_task_id_idx" ON "intelia"."task_automation_change" USING btree ("task_id","changed_at");--> statement-breakpoint
-- One-off backfill (design 18 §3): every open task gets `manual` with
-- verification, today's behaviour, and the change log records it as the
-- migration. Closed tasks keep no level; the flow engine reads that as manual.
-- Closed: in a final column of its project (upstream's taskIsCompleted), or,
-- in a legacy project without columns, `done`. This migration runs before
-- upstream's migrateColumns(), which gives those projects the default columns
-- with `done` as the only final one.
INSERT INTO "intelia"."task_automation" ("task_id", "level", "verification", "source")
SELECT "task"."id", 'manual', true, 'migration'
FROM "public"."task" AS "task"
WHERE NOT EXISTS (
	SELECT 1 FROM "public"."column" AS "column"
	WHERE "column"."project_id" = "task"."project_id"
		AND "column"."slug" = "task"."status"
		AND "column"."is_final" = true
)
AND NOT (
	"task"."status" = 'done'
	AND NOT EXISTS (
		SELECT 1 FROM "public"."column" AS "column"
		WHERE "column"."project_id" = "task"."project_id"
	)
);--> statement-breakpoint
INSERT INTO "intelia"."task_automation_change" ("id", "task_id", "level", "verification", "source", "changed_at")
SELECT gen_random_uuid()::text, "task_id", "level", "verification", "source", "set_at"
FROM "intelia"."task_automation"
WHERE "source" = 'migration';