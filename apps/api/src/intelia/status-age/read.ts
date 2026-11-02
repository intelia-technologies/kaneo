import { and, eq, notInArray, sql } from "drizzle-orm";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { statusSince } from "../status-since";

// Columns without a status age (design 23 §2): Done and Cancelled, with both
// spellings of Cancelled as in the initiative view.
const WITHOUT_AGE = ["done", "cancelled", "canceled"];

// Design 23 §4: finished stays whose exit falls in the last 90 days, with
// percentiles only from 10 of them, kept in memory 10 minutes per project.
const WINDOW_DAYS = 90;
const MIN_CASES = 10;
const CACHE_MS = 10 * 60 * 1000;

export type ColumnStats = {
  p75_s: number | null;
  p90_s: number | null;
  casos: number;
};

type CachedStats = {
  columnas: Record<string, ColumnStats>;
  calculado_en: Date;
};

const statsCache = new Map<string, CachedStats>();

/** Entry date of every task of the project outside Done and Cancelled. */
async function entryDates(projectId: string) {
  const rows = await db
    .select({ id: taskTable.id, since: statusSince })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, projectId),
        notInArray(taskTable.status, WITHOUT_AGE),
      ),
    );
  return Object.fromEntries(rows.map((row) => [row.id, row.since]));
}

// A stay runs from one status change of the task (or its creation, for the
// first) to the next, in the column the next one leaves (`oldStatus`). Stays
// still open are not rows here: they are what gets compared. Tasks are those
// now in the project (design 23 §7).
async function computeColumnStats(projectId: string) {
  const result = await db.execute<{
    status: string;
    casos: number;
    p75: number | null;
    p90: number | null;
  }>(sql`
    with stays as (
      select
        a.event_data->>'oldStatus' as status,
        a.created_at as exited_at,
        coalesce(
          lag(a.created_at) over (
            partition by a.task_id order by a.created_at, a.id
          ),
          t.created_at
        ) as entered_at
      from public.activity a
      join public.task t on t.id = a.task_id
      where t.project_id = ${projectId} and a.type = 'status_changed'
    ),
    durations as (
      select status, extract(epoch from exited_at - entered_at) as seconds
      from stays
      where status is not null
        and exited_at >= (now() at time zone 'utc') - make_interval(days => ${WINDOW_DAYS})
    )
    select
      status,
      count(*)::int as casos,
      percentile_cont(0.75) within group (order by seconds) as p75,
      percentile_cont(0.9) within group (order by seconds) as p90
    from durations
    group by status
  `);

  const columnas: Record<string, ColumnStats> = {};
  for (const row of result.rows) {
    const based = row.casos >= MIN_CASES;
    columnas[row.status] = {
      p75_s: based && row.p75 !== null ? Math.round(Number(row.p75)) : null,
      p90_s: based && row.p90 !== null ? Math.round(Number(row.p90)) : null,
      casos: row.casos,
    };
  }
  return columnas;
}

async function columnStats(projectId: string): Promise<CachedStats> {
  const cached = statsCache.get(projectId);
  if (cached && Date.now() - cached.calculado_en.getTime() < CACHE_MS) {
    return cached;
  }
  const fresh = {
    columnas: await computeColumnStats(projectId),
    calculado_en: new Date(Date.now()),
  };
  statsCache.set(projectId, fresh);
  return fresh;
}

/** GET …/project/{projectId}/status-age (design 23 §6). */
export async function getProjectStatusAge(projectId: string) {
  const [tareas, stats] = await Promise.all([
    entryDates(projectId),
    columnStats(projectId),
  ]);
  return { tareas, ...stats };
}
