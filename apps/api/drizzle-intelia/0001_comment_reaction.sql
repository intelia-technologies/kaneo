CREATE TABLE "intelia"."comment_reaction" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"comment_id" text,
	"emoji" text NOT NULL,
	"user_id" text NOT NULL,
	"external_user_name" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intelia"."comment_reaction" ADD CONSTRAINT "comment_reaction_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."comment_reaction" ADD CONSTRAINT "comment_reaction_comment_id_activity_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."activity"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."comment_reaction" ADD CONSTRAINT "comment_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_reaction_unique_idx" ON "intelia"."comment_reaction" USING btree ("task_id",coalesce("comment_id", ''),"emoji","user_id",coalesce("external_user_name", ''));--> statement-breakpoint
CREATE INDEX "comment_reaction_comment_id_idx" ON "intelia"."comment_reaction" USING btree ("comment_id");