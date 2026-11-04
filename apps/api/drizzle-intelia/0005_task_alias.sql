CREATE TABLE "intelia"."task_alias" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"project_id" text NOT NULL,
	"number" integer NOT NULL,
	"moved_by_user_id" text,
	"moved_by_actor" text,
	"moved_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intelia"."task_alias" ADD CONSTRAINT "task_alias_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."task_alias" ADD CONSTRAINT "task_alias_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."task_alias" ADD CONSTRAINT "task_alias_moved_by_user_id_user_id_fk" FOREIGN KEY ("moved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "task_alias_project_number_idx" ON "intelia"."task_alias" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "task_alias_task_id_idx" ON "intelia"."task_alias" USING btree ("task_id","moved_at");