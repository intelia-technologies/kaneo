CREATE TABLE "intelia"."task_classification" (
  "task_id" text PRIMARY KEY CONSTRAINT "task_classification_task_id_task_id_fk" REFERENCES "public"."task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type" text NOT NULL CHECK ("type" IN ('implementacion', 'validacion', 'operacion', 'diseno')),
  "validation_in_production" text,
  "validation_in_production_reason" text,
  CONSTRAINT "task_classification_validation_check" CHECK (
    ("type" IN ('validacion', 'diseno') AND "validation_in_production" IS NULL AND "validation_in_production_reason" IS NULL)
    OR ("type" IN ('implementacion', 'operacion') AND "validation_in_production" IS NOT NULL AND (
      ("validation_in_production" = 'requerida' AND "validation_in_production_reason" IS NULL)
      OR ("validation_in_production" = 'no_aplica' AND "validation_in_production_reason" IS NOT NULL AND length(trim("validation_in_production_reason")) > 0 AND "validation_in_production_reason" !~ E'[\\r\\n]')
    ))
  )
);
