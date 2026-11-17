-- Design 81 §4.1 (PZ-03, KF-15): pause of a project or an initiative, its
-- change log, and the run of a routine skipped by it. New tables and one
-- nullable column; existing data untouched. No workspace column: a pause
-- follows its home project when the project moves to another workspace. The
-- authors' user ids have no foreign key, so the history keeps naming them
-- after the Kaneo user is deleted.
CREATE TABLE "intelia"."scope_pause" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_type" text NOT NULL,
	"project_id" text,
	"initiative_id" text,
	"motivo" text NOT NULL,
	"revisar_el" date NOT NULL,
	"paused_by_user_id" text,
	"paused_by_actor" text,
	"paused_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"resumed_by_user_id" text,
	"resumed_by_actor" text,
	"resumed_at" timestamp,
	"nota_reanudar" text,
	CONSTRAINT "scope_pause_type_check" CHECK ("scope_type" in ('project', 'initiative')),
	CONSTRAINT "scope_pause_scope_check" CHECK (("scope_type" = 'project' AND "project_id" IS NOT NULL AND "initiative_id" IS NULL) OR ("scope_type" = 'initiative' AND "initiative_id" IS NOT NULL AND "project_id" IS NULL)),
	CONSTRAINT "scope_pause_motivo_check" CHECK (char_length("motivo") BETWEEN 3 AND 500)
);
--> statement-breakpoint
CREATE TABLE "intelia"."scope_pause_change" (
	"id" text PRIMARY KEY NOT NULL,
	"pause_id" text NOT NULL,
	"kind" text NOT NULL,
	"previous" jsonb,
	"value" jsonb NOT NULL,
	"changed_by_user_id" text,
	"changed_by_actor" text,
	"source" text NOT NULL,
	"changed_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "scope_pause_change_kind_check" CHECK ("kind" in ('created', 'updated', 'resumed')),
	CONSTRAINT "scope_pause_change_source_check" CHECK ("source" in ('session', 'api_key'))
);
--> statement-breakpoint
ALTER TABLE "intelia"."scope_pause" ADD CONSTRAINT "scope_pause_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."scope_pause" ADD CONSTRAINT "scope_pause_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "intelia"."initiative"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."scope_pause_change" ADD CONSTRAINT "scope_pause_change_pause_id_scope_pause_id_fk" FOREIGN KEY ("pause_id") REFERENCES "intelia"."scope_pause"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "scope_pause_active_project_idx" ON "intelia"."scope_pause" USING btree ("project_id") WHERE "resumed_at" IS NULL AND "project_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "scope_pause_active_initiative_idx" ON "intelia"."scope_pause" USING btree ("initiative_id") WHERE "resumed_at" IS NULL AND "initiative_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "scope_pause_resumed_at_idx" ON "intelia"."scope_pause" USING btree ("resumed_at");--> statement-breakpoint
CREATE INDEX "scope_pause_change_pause_id_idx" ON "intelia"."scope_pause_change" USING btree ("pause_id","changed_at");--> statement-breakpoint
ALTER TABLE "intelia"."routine_run" ADD COLUMN "scope_pause_id" text;--> statement-breakpoint
ALTER TABLE "intelia"."routine_run" ADD CONSTRAINT "routine_run_scope_pause_id_scope_pause_id_fk" FOREIGN KEY ("scope_pause_id") REFERENCES "intelia"."scope_pause"("id") ON DELETE set null ON UPDATE cascade;
