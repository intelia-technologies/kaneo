-- Read-only (README-INTELIA.md, «Si upstream recrea public.task», step 2):
-- for each column of the intelia schema that points to public.task, how many
-- rows there are, how many point to a task that no longer exists, and whether
-- its foreign key is in place. Changes nothing.
SELECT 'comment_reaction.task_id' AS "column", count(*) AS "rows",
	count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.task t WHERE t.id = o.task_id)) AS "orphans",
	EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comment_reaction_task_id_task_id_fk') AS "foreign_key"
FROM intelia.comment_reaction o
UNION ALL
SELECT 'routine.task_id', count(*),
	count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.task t WHERE t.id = o.task_id)),
	EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routine_task_id_task_id_fk')
FROM intelia.routine o
UNION ALL
SELECT 'task_automation.task_id', count(*),
	count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.task t WHERE t.id = o.task_id)),
	EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_automation_task_id_task_id_fk')
FROM intelia.task_automation o
UNION ALL
SELECT 'task_automation_change.task_id', count(*),
	count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.task t WHERE t.id = o.task_id)),
	EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_automation_change_task_id_task_id_fk')
FROM intelia.task_automation_change o
UNION ALL
SELECT 'initiative_change.task_id', count(o.task_id),
	count(o.task_id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.task t WHERE t.id = o.task_id)),
	EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'initiative_change_task_id_task_id_fk')
FROM intelia.initiative_change o
UNION ALL
SELECT 'task_initiative.task_id', count(*),
	count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.task t WHERE t.id = o.task_id)),
	EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_initiative_task_id_task_id_fk')
FROM intelia.task_initiative o
UNION ALL
SELECT 'task_initiative_change.task_id', count(*),
	count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.task t WHERE t.id = o.task_id)),
	EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_initiative_change_task_id_task_id_fk')
FROM intelia.task_initiative_change o
UNION ALL
SELECT 'task_alias.task_id', count(*),
	count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.task t WHERE t.id = o.task_id)),
	EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_alias_task_id_task_id_fk')
FROM intelia.task_alias o
UNION ALL
SELECT 'task_classification.task_id', count(*),
	count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.task t WHERE t.id = o.task_id)),
	EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_classification_task_id_task_id_fk')
FROM intelia.task_classification o;
