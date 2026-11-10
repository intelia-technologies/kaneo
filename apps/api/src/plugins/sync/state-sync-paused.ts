import { and, eq } from "drizzle-orm";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { ARCHIVED_STATUS } from "../../intelia/task-archive/archive-status";
import { taskIsArchived } from "../../intelia/task-archive/board";

// Archived tasks take no part in open/closed issue sync in either direction.
// Unarchiving lets the status handlers bring the issue back in line.
export function isArchivedStatus(status: string) {
  return status === ARCHIVED_STATUS;
}

/**
 * Whether a task's open/closed state is out of sync: upstream's virtual
 * `archived` status or, in the Intelia fork (design 53 §3.2), the archive mark
 * on a closed task. A reopened task syncs again even before its mark is gone.
 */
export async function isStateSyncPaused(
  task: { id: string; status: string },
  database: Pick<typeof db, "select"> = db,
) {
  if (isArchivedStatus(task.status)) return true;
  const [marked] = await database
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(and(eq(taskTable.id, task.id), taskIsArchived))
    .limit(1);
  return Boolean(marked);
}
