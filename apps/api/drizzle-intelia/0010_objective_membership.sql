WITH invalid AS (
  SELECT i.id, i.objetivo,
    greatest(date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'utc'),
      (SELECT max(c.changed_at) + interval '1 millisecond'
       FROM intelia.initiative_change c WHERE c.initiative_id = i.id)) AS changed_at
  FROM intelia.initiative i
  WHERE i.objetivo IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM intelia.task_initiative ti
    WHERE ti.task_id = i.objetivo AND ti.initiative_id = i.id
  )
), logged AS (
  INSERT INTO intelia.initiative_change
    (id, initiative_id, kind, previous, value, source, changed_at)
  SELECT gen_random_uuid()::text, id, 'updated', jsonb_build_object('objetivo', objetivo),
    '{"objetivo": null}'::jsonb, 'migration', changed_at FROM invalid
)
UPDATE intelia.initiative i SET objetivo = NULL FROM invalid WHERE i.id = invalid.id;
