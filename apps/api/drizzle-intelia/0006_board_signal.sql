CREATE TABLE "intelia"."board_signal" (
	"project_id" text PRIMARY KEY NOT NULL,
	"signals" jsonb NOT NULL,
	"calculated_at" timestamp NOT NULL,
	"updated_by_user_id" text,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intelia"."board_signal" ADD CONSTRAINT "board_signal_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."board_signal" ADD CONSTRAINT "board_signal_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;