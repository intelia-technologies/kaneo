import { sql } from "drizzle-orm";
import db from "../../../database";
import type { AutomationLevel } from "../../schema";
import type { Sample } from "./estimate";
import { executorKind } from "./executor";

// Annex of design 19 §3.3: tasks finished in the last 90 days, kept in memory
// 10 minutes per workspace, as the status age does (design 23 §4).
const WINDOW_DAYS = 90;
const CACHE_MS = 10 * 60 * 1000;

type CachedSamples = { samples: Sample[]; computedAt: Date };

const cache = new Map<string, CachedSamples>();

// The real duration of a Done task: its stays in In progress and In review,
// from its activity log (Blocked and the rest do not count). A stay runs from
// one status change (or the task's creation) to the next, as in design 23.
// Tasks that reached Done without a stay there say nothing about how long
// work takes and are left out. Every project of the workspace: the caller
// keeps only the ones the reader can read.
async function computeSamples(workspaceId: string): Promise<Sample[]> {
  const result = await db.execute<{
    project_id: string;
    level: AutomationLevel | null;
    email: string | null;
    worked_s: number;
  }>(sql`
    with changes as (
      select
        a.task_id,
        a.created_at,
        a.event_data->>'oldStatus' as old_status,
        a.event_data->>'newStatus' as new_status,
        coalesce(
          lag(a.created_at) over (
            partition by a.task_id order by a.created_at, a.id
          ),
          t.created_at
        ) as entered_at
      from public.activity a
      join public.task t on t.id = a.task_id
      join public.project p on p.id = t.project_id
      where p.workspace_id = ${workspaceId}
        and t.status = 'done'
        and a.type = 'status_changed'
    ),
    finished as (
      select
        task_id,
        sum(extract(epoch from created_at - entered_at))
          filter (where old_status in ('in-progress', 'in-review')) as worked_s,
        max(created_at) filter (where new_status = 'done') as done_at
      from changes
      group by task_id
    )
    select t.project_id, ta.level, u.email, f.worked_s::float8 as worked_s
    from finished f
    join public.task t on t.id = f.task_id
    left join intelia.task_automation ta on ta.task_id = t.id
    left join public."user" u on u.id = t.assignee_id
    where f.worked_s > 0
      and f.done_at >= (now() at time zone 'utc') - make_interval(days => ${WINDOW_DAYS})
  `);
  return result.rows.map((row) => ({
    projectId: row.project_id,
    level: row.level,
    kind: executorKind(row.email),
    hours: Number(row.worked_s) / 3600,
  }));
}

/** Finished tasks of the workspace, every project, cached 10 minutes. */
export async function workspaceSamples(
  workspaceId: string,
): Promise<CachedSamples> {
  const cached = cache.get(workspaceId);
  if (cached && Date.now() - cached.computedAt.getTime() < CACHE_MS) {
    return cached;
  }
  const fresh = {
    samples: await computeSamples(workspaceId),
    computedAt: new Date(Date.now()),
  };
  cache.set(workspaceId, fresh);
  return fresh;
}
