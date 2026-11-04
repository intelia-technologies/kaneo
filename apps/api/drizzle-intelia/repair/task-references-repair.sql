-- Repair (README-INTELIA.md, «Si upstream recrea public.task», step 3), one
-- transaction: for each foreign key of the intelia schema to public.task that
-- is missing, applies its ON DELETE to the rows whose task no longer exists
-- (what the key would have done: delete them, or empty the column) and adds the
-- key back as migrations 0001-0005 created it. Keys already in place are left
-- alone, so running it twice changes nothing the second time. The list must
-- match the Drizzle schema: the startup check (apps/api/src/intelia/task-hooks.ts)
-- refuses to start while one is missing. The trigger is not here: every
-- startup reinstalls it.
BEGIN;
DO $$
DECLARE
	k record;
	removed bigint;
BEGIN
	FOR k IN SELECT * FROM (VALUES
		('comment_reaction', 'comment_reaction_task_id_task_id_fk', 'cascade'),
		('routine', 'routine_task_id_task_id_fk', 'cascade'),
		('task_automation', 'task_automation_task_id_task_id_fk', 'cascade'),
		('task_automation_change', 'task_automation_change_task_id_task_id_fk', 'cascade'),
		('initiative_change', 'initiative_change_task_id_task_id_fk', 'set null'),
		('task_initiative', 'task_initiative_task_id_task_id_fk', 'cascade'),
		('task_initiative_change', 'task_initiative_change_task_id_task_id_fk', 'cascade'),
		('task_alias', 'task_alias_task_id_task_id_fk', 'cascade')
	) AS v(tbl, constraint_name, on_delete)
	LOOP
		IF EXISTS (
			SELECT 1 FROM pg_constraint
			WHERE conname = k.constraint_name
				AND conrelid = format('intelia.%I', k.tbl)::regclass
		) THEN
			CONTINUE;
		END IF;
		IF k.on_delete = 'cascade' THEN
			EXECUTE format(
				'DELETE FROM intelia.%I o WHERE NOT EXISTS (SELECT 1 FROM public.task t WHERE t.id = o.task_id)',
				k.tbl);
		ELSE
			EXECUTE format(
				'UPDATE intelia.%I o SET task_id = NULL WHERE o.task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.task t WHERE t.id = o.task_id)',
				k.tbl);
		END IF;
		GET DIAGNOSTICS removed = ROW_COUNT;
		EXECUTE format(
			'ALTER TABLE intelia.%I ADD CONSTRAINT %I FOREIGN KEY (task_id) REFERENCES public.task(id) ON DELETE %s ON UPDATE cascade',
			k.tbl, k.constraint_name, k.on_delete);
		RAISE NOTICE 'intelia.%: % restored (% orphan rows, ON DELETE %)',
			k.tbl, k.constraint_name, removed, k.on_delete;
	END LOOP;
END;
$$;
COMMIT;
