import { sql } from "drizzle-orm";
import { taskTable } from "../database/schema";

/**
 * When the task entered its current column (design 23 §3): its last
 * `status_changed` activity or, if it never changed, its creation. Reordering
 * within a column leaves no activity, and `updatedAt` changes with any edit,
 * so neither counts. A column of a select over `task` (not aliased), resolved
 * in the same statement through `activity_task_id_idx`. Shared by the
 * initiative view (design 19) and the status age (design 23).
 *
 * The task's columns are qualified by hand: Drizzle leaves them bare in
 * single-table selects, where `id` would resolve to the activity's.
 */
export const statusSince = sql<Date>`coalesce(
  (select max(a.created_at) from public.activity a
    where a.task_id = "task"."id" and a.type = 'status_changed'),
  "task"."created_at")`.mapWith(taskTable.createdAt);
