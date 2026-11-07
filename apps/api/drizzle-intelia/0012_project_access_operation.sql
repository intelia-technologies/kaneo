-- project-access operations (SF-935, KV-05) first shipped as
-- apps/api/drizzle/0067_project_access_operations.sql, in upstream's journal,
-- creating public.project_access_operation. Upstream v2.49.0 ships its own
-- 0067, so the table moves here (SF-1134, KF-10). Databases that already have
-- it keep their rows: SET SCHEMA moves the table with its data, primary key
-- and check. Fresh databases create it directly in the intelia schema.
DO $$
BEGIN
  IF to_regclass('public.project_access_operation') IS NOT NULL THEN
    ALTER TABLE "public"."project_access_operation" SET SCHEMA "intelia";
  ELSE
    CREATE TABLE "intelia"."project_access_operation" (
      "workspace_id" text NOT NULL,
      "user_id" text NOT NULL,
      "actor_id" text NOT NULL,
      "operation_id" uuid NOT NULL,
      "request" jsonb,
      "response" jsonb,
      CHECK (("request" IS NULL) = ("response" IS NULL)),
      PRIMARY KEY ("workspace_id", "user_id", "operation_id")
    );
  END IF;
END
$$;
