CREATE TABLE "intelia"."routine_run" (
	"id" text PRIMARY KEY NOT NULL,
	"routine_id" text NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"result" text NOT NULL,
	"error" text,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intelia"."routine" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"cron" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Madrid' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"owner_id" text NOT NULL,
	"next_run_at" timestamp NOT NULL,
	"last_run_at" timestamp,
	"last_result" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intelia"."routine_run" ADD CONSTRAINT "routine_run_routine_id_routine_id_fk" FOREIGN KEY ("routine_id") REFERENCES "intelia"."routine"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."routine" ADD CONSTRAINT "routine_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."routine" ADD CONSTRAINT "routine_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "routine_run_routine_id_idx" ON "intelia"."routine_run" USING btree ("routine_id","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_task_id_idx" ON "intelia"."routine" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "routine_due_idx" ON "intelia"."routine" USING btree ("active","next_run_at");