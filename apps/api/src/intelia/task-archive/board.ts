import { type SQL, sql } from "drizzle-orm";
import { taskTable } from "../../database/schema";
import { taskIsCompleted } from "../../task/task-is-completed";
import { taskArchiveTable } from "../schema";
import type { ArchivedScope } from "./schema";

// Which tasks a board or listing returns (design 53 §3.2): archived ones only
// when asked. Archived means the mark, or upstream's virtual `archived` status
// of tasks archived before the mark existed that migration 0015 could not
// restore; both stay out by default and both make the archived section.
//
// The mark only counts while the task is in a final column: a reopened task
// is back on the board at once, even before the reopen's event drops its mark
// (or if a column stops being final).
export const taskArchivedAt =
  sql<Date | null>`(select ${taskArchiveTable.archivedAt} from ${taskArchiveTable} where ${taskArchiveTable.taskId} = ${taskTable.id} and ${taskIsCompleted})`.mapWith(
    taskArchiveTable.archivedAt,
  );

const isMarked = sql`(exists (select 1 from ${taskArchiveTable} where ${taskArchiveTable.taskId} = ${taskTable.id}) and ${taskIsCompleted})`;

export function archivedScopeCondition(
  scope: ArchivedScope = "exclude",
): SQL | undefined {
  if (scope === "include") return undefined;
  const archived = sql`(${isMarked} or ${taskTable.status} = 'archived')`;
  return scope === "only" ? archived : sql`not ${archived}`;
}
