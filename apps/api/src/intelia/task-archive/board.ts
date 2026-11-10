import { type SQL, sql } from "drizzle-orm";
import { taskTable } from "../../database/schema";
import { taskIsCompleted } from "../../task/task-is-completed";
import { taskArchiveTable } from "../schema";
import type { ArchivedScope } from "./schema";

// Which tasks a board or listing returns (design 53 §3.2): tasks with the
// archive mark only when asked. Upstream's virtual `archived` status (the few
// tasks migration 0016 could not restore, left for review) keeps upstream's
// behavior: in the default board's archived bucket. The archived section
// (`only`) shows both.
//
// The mark only counts while the task is in a final column: a reopened task
// is back on the board at once, even before the reopen's event drops its mark
// (or if a column stops being final).
export const taskArchivedAt =
  sql<Date | null>`(select ${taskArchiveTable.archivedAt} from ${taskArchiveTable} where ${taskArchiveTable.taskId} = ${taskTable.id} and ${taskIsCompleted})`.mapWith(
    taskArchiveTable.archivedAt,
  );

// A task with the mark, while it is closed.
export const taskIsArchived = sql`(exists (select 1 from ${taskArchiveTable} where ${taskArchiveTable.taskId} = ${taskTable.id}) and ${taskIsCompleted})`;

export function archivedScopeCondition(
  scope: ArchivedScope = "exclude",
): SQL | undefined {
  if (scope === "include") return undefined;
  if (scope === "only")
    return sql`(${taskIsArchived} or ${taskTable.status} = 'archived')`;
  return sql`not ${taskIsArchived}`;
}
