-- Design 80 §4.1 (BC-06): until when a task waits, next to `columna_previa`.
-- Nullable: every existing automation keeps waiting for nothing.
ALTER TABLE "intelia"."task_automation" ADD COLUMN "espera_hasta" timestamp with time zone;
