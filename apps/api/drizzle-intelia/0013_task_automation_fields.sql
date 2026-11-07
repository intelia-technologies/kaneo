-- Design 48 §3.2 (NU-01k): the task fields of the new dispatcher core, on
-- intelia.task_automation. `automatica` replaces the level for the new core;
-- the level stays, tied to it, for the old engine until the cut.
ALTER TABLE "intelia"."task_automation" ADD COLUMN "automatica" boolean;--> statement-breakpoint
ALTER TABLE "intelia"."task_automation" ADD COLUMN "pausa_motivo" text;--> statement-breakpoint
ALTER TABLE "intelia"."task_automation" ADD COLUMN "entrega" text;--> statement-breakpoint
ALTER TABLE "intelia"."task_automation" ADD COLUMN "responsable" text;--> statement-breakpoint
ALTER TABLE "intelia"."task_automation" ADD COLUMN "implementador" text;--> statement-breakpoint
ALTER TABLE "intelia"."task_automation" ADD COLUMN "verificador" text;--> statement-breakpoint
ALTER TABLE "intelia"."task_automation" ADD COLUMN "columna_previa" text;--> statement-breakpoint
-- manual → no; arranque and completa → yes; the verification stays.
UPDATE "intelia"."task_automation" SET "automatica" = ("level" <> 'manual');--> statement-breakpoint
-- The default delivery of each type (design 48 §3.2): a PR for an
-- implementation, none for an operation or a validation. A design, or a task
-- without type, keeps none: its designer decides.
UPDATE "intelia"."task_automation" AS "automation"
SET "entrega" = CASE "classification"."type"
	WHEN 'implementacion' THEN 'pr'
	ELSE 'sin_pr'
END
FROM "intelia"."task_classification" AS "classification"
WHERE "classification"."task_id" = "automation"."task_id"
	AND "classification"."type" IN ('implementacion', 'operacion', 'validacion');--> statement-breakpoint
ALTER TABLE "intelia"."task_automation" ALTER COLUMN "automatica" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "intelia"."task_automation" ADD CONSTRAINT "task_automation_automatica_level_check" CHECK (("level" = 'manual') = (not "automatica"));--> statement-breakpoint
ALTER TABLE "intelia"."task_automation" ADD CONSTRAINT "task_automation_pausa_check" CHECK ("pausa_motivo" is null or (not "automatica" and length(btrim("pausa_motivo")) > 0));--> statement-breakpoint
ALTER TABLE "intelia"."task_automation" ADD CONSTRAINT "task_automation_entrega_check" CHECK ("entrega" is null or "entrega" in ('pr', 'sin_pr'));--> statement-breakpoint
ALTER TABLE "intelia"."task_automation_change" ADD COLUMN "previous_automatica" boolean;--> statement-breakpoint
ALTER TABLE "intelia"."task_automation_change" ADD COLUMN "automatica" boolean;--> statement-breakpoint
ALTER TABLE "intelia"."task_automation_change" ADD COLUMN "pausa_motivo" text;--> statement-breakpoint
ALTER TABLE "intelia"."task_automation_change" ADD COLUMN "entrega" text;--> statement-breakpoint
-- The log already written reads the same way: each level as its automatica.
UPDATE "intelia"."task_automation_change"
SET "automatica" = ("level" <> 'manual'),
	"previous_automatica" = ("previous_level" <> 'manual');--> statement-breakpoint
ALTER TABLE "intelia"."task_automation_change" ALTER COLUMN "automatica" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "intelia"."task_automation_change" ADD CONSTRAINT "task_automation_change_entrega_check" CHECK ("entrega" is null or "entrega" in ('pr', 'sin_pr'));
