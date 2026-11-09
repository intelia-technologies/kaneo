-- Design 53 §3.5 (OG-05): the workspace's priorities, their links with
-- projects and their change log. New tables only; existing data untouched.
CREATE TABLE "intelia"."priority" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"parent_id" text,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "priority_status_check" CHECK ("status" in ('active', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "intelia"."priority_project" (
	"priority_id" text NOT NULL,
	"project_id" text NOT NULL,
	CONSTRAINT "priority_project_priority_id_project_id_pk" PRIMARY KEY("priority_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "intelia"."priority_change" (
	"id" text PRIMARY KEY NOT NULL,
	"priority_id" text NOT NULL,
	"kind" text NOT NULL,
	"previous" jsonb,
	"value" jsonb NOT NULL,
	"changed_by_user_id" text,
	"source" text NOT NULL,
	"changed_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "priority_change_kind_check" CHECK ("kind" in ('created', 'updated')),
	CONSTRAINT "priority_change_source_check" CHECK ("source" in ('session', 'api_key'))
);
--> statement-breakpoint
CREATE TABLE "intelia"."priority_webhook" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"url" text NOT NULL,
	"secret" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intelia"."priority" ADD CONSTRAINT "priority_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."priority" ADD CONSTRAINT "priority_parent_id_priority_id_fk" FOREIGN KEY ("parent_id") REFERENCES "intelia"."priority"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."priority" ADD CONSTRAINT "priority_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."priority_project" ADD CONSTRAINT "priority_project_priority_id_priority_id_fk" FOREIGN KEY ("priority_id") REFERENCES "intelia"."priority"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."priority_project" ADD CONSTRAINT "priority_project_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."priority_change" ADD CONSTRAINT "priority_change_priority_id_priority_id_fk" FOREIGN KEY ("priority_id") REFERENCES "intelia"."priority"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."priority_change" ADD CONSTRAINT "priority_change_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "priority_workspace_parent_idx" ON "intelia"."priority" USING btree ("workspace_id","parent_id","position");--> statement-breakpoint
CREATE INDEX "priority_project_project_id_idx" ON "intelia"."priority_project" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "priority_change_priority_id_idx" ON "intelia"."priority_change" USING btree ("priority_id","changed_at");--> statement-breakpoint
ALTER TABLE "intelia"."priority_webhook" ADD CONSTRAINT "priority_webhook_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."priority_webhook" ADD CONSTRAINT "priority_webhook_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "priority_webhook_workspace_url_idx" ON "intelia"."priority_webhook" USING btree ("workspace_id","url");
