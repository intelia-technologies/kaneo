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
CREATE INDEX "task_initiative_initiative_id_idx" ON "intelia"."task_initiative" USING btree ("initiative_id");--> statement-breakpoint
-- The plan closes on its own when a task of the initiative reaches In progress
-- (design 19 §4), inside the transaction that changes the status, whichever
-- path writes it (API, bulk, reorder, integrations, routines). A trigger on
-- upstream's task table is the one hook that sees every path; it adds no
-- column and no constraint (README-INTELIA.md, «Iniciativas»). It takes the
-- initiative's row lock, the same one the API takes to assign a task, so an
-- assignment is ordered before or after the close, never across it.
CREATE FUNCTION "intelia"."close_plan_on_start"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	v_initiative text;
	v_at timestamp;
BEGIN
	SELECT "i"."id" INTO v_initiative
	FROM "intelia"."task_initiative" AS "ti"
	JOIN "intelia"."initiative" AS "i" ON "i"."id" = "ti"."initiative_id"
	WHERE "ti"."task_id" = NEW."id"
		AND "i"."project_id" = NEW."project_id"
		AND "i"."plan_closed_at" IS NULL;
	IF v_initiative IS NULL THEN
		RETURN NULL;
	END IF;
	-- Rechecked under the lock: another transaction may have closed it.
	PERFORM 1 FROM "intelia"."initiative"
	WHERE "id" = v_initiative AND "plan_closed_at" IS NULL
	FOR UPDATE;
	IF NOT FOUND THEN
		RETURN NULL;
	END IF;
	-- Strictly after the initiative's last log row, as the API writes them.
	SELECT greatest(
		date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'utc'),
		max("changed_at") + interval '1 millisecond'
	) INTO v_at
	FROM "intelia"."initiative_change"
	WHERE "initiative_id" = v_initiative;
	UPDATE "intelia"."initiative" SET "plan_closed_at" = v_at WHERE "id" = v_initiative;
	INSERT INTO "intelia"."initiative_change"
		("id", "initiative_id", "kind", "previous", "value", "task_id", "source", "changed_at")
	VALUES (
		gen_random_uuid()::text, v_initiative, 'plan_closed',
		'{"planClosedAt": null}'::jsonb,
		jsonb_build_object('planClosedAt', to_char(v_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
		NEW."id", 'auto', v_at
	);
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "intelia_close_plan_on_start"
AFTER UPDATE OF "status" ON "public"."task"
FOR EACH ROW
WHEN (NEW."status" = 'in-progress' AND OLD."status" IS DISTINCT FROM NEW."status")
EXECUTE FUNCTION "intelia"."close_plan_on_start"();