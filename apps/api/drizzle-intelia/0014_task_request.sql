-- Design 52 §3.2 (IM-04): the «Pedida» column and the requester of a task.
CREATE TABLE "intelia"."task_request" (
	"task_id" text PRIMARY KEY NOT NULL,
	"requester_user_id" text NOT NULL,
	"set_by_user_id" text,
	"set_by_actor" text,
	"requested_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"pending_reason" text,
	"closed_at" timestamp,
	"closed_reason" text
);--> statement-breakpoint
ALTER TABLE "intelia"."task_request" ADD CONSTRAINT "task_request_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."task_request" ADD CONSTRAINT "task_request_requester_user_id_user_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intelia"."task_request" ADD CONSTRAINT "task_request_set_by_user_id_user_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "task_request_requester_idx" ON "intelia"."task_request" USING btree ("requester_user_id","requested_at");--> statement-breakpoint
-- Every existing project gets the «Pedida» column (slug `pedida`), before
-- Backlog if the project has one, first otherwise; the columns from there on
-- move one place right. A project that already has `pedida` keeps it, and one
-- without columns is left to upstream's column migration (migrateColumns
-- seeds only projects with none), which runs after this one at startup.
WITH "target" AS (
	SELECT "p"."id" AS "project_id",
		coalesce(
			(SELECT min("b"."position") FROM "public"."column" AS "b"
				WHERE "b"."project_id" = "p"."id" AND "b"."slug" = 'backlog'),
			0
		) AS "position"
	FROM "public"."project" AS "p"
	WHERE EXISTS (
		SELECT 1 FROM "public"."column" AS "a" WHERE "a"."project_id" = "p"."id"
	) AND NOT EXISTS (
		SELECT 1 FROM "public"."column" AS "c"
		WHERE "c"."project_id" = "p"."id" AND "c"."slug" = 'pedida'
	)
), "shifted" AS (
	UPDATE "public"."column" AS "c"
	SET "position" = "c"."position" + 1
	FROM "target" AS "t"
	WHERE "c"."project_id" = "t"."project_id" AND "c"."position" >= "t"."position"
	RETURNING "c"."id"
)
INSERT INTO "public"."column" ("id", "project_id", "name", "slug", "position", "is_final")
SELECT gen_random_uuid()::text, "t"."project_id", 'Pedida', 'pedida', "t"."position", false
FROM "target" AS "t";
