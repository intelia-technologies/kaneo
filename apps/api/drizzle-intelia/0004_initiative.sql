CREATE TABLE "intelia"."initiative_change" (
	"id" text PRIMARY KEY NOT NULL,
	"initiative_id" text NOT NULL,
	"kind" text NOT NULL,
	"previous" jsonb,
	"value" jsonb NOT NULL,
	"task_id" text,
	"changed_by_user_id" text,
	"changed_by_actor" text,
	"source" text NOT NULL,
	"changed_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "initiative_change_kind_check" CHECK ("kind" in ('created', 'updated', 'plan_closed')),
	CONSTRAINT "initiative_change_source_check" CHECK ("source" in ('session', 'api_key', 'auto', 'migration'))
);
--> statement-breakpoint
CREATE TABLE "intelia"."initiative" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"design_url" text,
	"approved_by" text,
	"approved_at" timestamp,
	"created_by_user_id" text,
	"created_by_actor" text,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"plan_closed_at" timestamp,
	CONSTRAINT "initiative_source_check" CHECK ("source" in ('session', 'api_key', 'migration'))
);
--> statement-breakpoint
CREATE TABLE "intelia"."task_initiative_change" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"previous_initiative_id" text,
	"previous_origin" text,
	"initiative_id" text,
	"origin" text,
	"changed_by_user_id" text,
	"changed_by_actor" text,
	"source" text NOT NULL,
	"changed_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "task_initiative_change_source_check" CHECK ("source" in ('session', 'api_key', 'project_move', 'migration'))
);
--> statement-breakpoint
CREATE TABLE "intelia"."task_initiative" (
	"task_id" text PRIMARY KEY NOT NULL,
	"initiative_id" text NOT NULL,
	"origin" text NOT NULL,
	"since" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"set_by_user_id" text,
	"set_by_actor" text,
	"source" text NOT NULL,
	CONSTRAINT "task_initiative_origin_check" CHECK ("origin" in ('plan', 'añadido', 'sin_registro')),
	CONSTRAINT "task_initiative_source_check" CHECK ("source" in ('session', 'api_key', 'migration'))
);
--> statement-breakpoint
ALTER TABLE "intelia"."initiative_change" ADD CONSTRAINT "initiative_change_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "intelia"."initiative"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."initiative_change" ADD CONSTRAINT "initiative_change_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."initiative_change" ADD CONSTRAINT "initiative_change_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."initiative" ADD CONSTRAINT "initiative_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."initiative" ADD CONSTRAINT "initiative_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."task_initiative_change" ADD CONSTRAINT "task_initiative_change_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."task_initiative_change" ADD CONSTRAINT "task_initiative_change_previous_initiative_id_initiative_id_fk" FOREIGN KEY ("previous_initiative_id") REFERENCES "intelia"."initiative"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."task_initiative_change" ADD CONSTRAINT "task_initiative_change_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "intelia"."initiative"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."task_initiative_change" ADD CONSTRAINT "task_initiative_change_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."task_initiative" ADD CONSTRAINT "task_initiative_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."task_initiative" ADD CONSTRAINT "task_initiative_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "intelia"."initiative"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."task_initiative" ADD CONSTRAINT "task_initiative_set_by_user_id_user_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "initiative_change_initiative_id_idx" ON "intelia"."initiative_change" USING btree ("initiative_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_project_name_key_idx" ON "intelia"."initiative" USING btree ("project_id","name_key");--> statement-breakpoint
CREATE INDEX "task_initiative_change_task_id_idx" ON "intelia"."task_initiative_change" USING btree ("task_id","changed_at");--> statement-breakpoint
CREATE INDEX "task_initiative_initiative_id_idx" ON "intelia"."task_initiative" USING btree ("initiative_id");