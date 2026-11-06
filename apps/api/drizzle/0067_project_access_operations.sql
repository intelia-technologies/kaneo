CREATE TABLE "project_access_operation" (
  "workspace_id" text NOT NULL,
  "user_id" text NOT NULL,
  "actor_id" text NOT NULL,
  "operation_id" uuid NOT NULL,
  "request" jsonb,
  "response" jsonb,
  CHECK (("request" IS NULL) = ("response" IS NULL)),
  PRIMARY KEY ("workspace_id", "user_id", "operation_id")
);
