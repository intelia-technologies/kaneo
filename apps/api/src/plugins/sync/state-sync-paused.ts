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
 * Intelia (design 53 §3.2): whether the task is closed with the archive mark.
 * No integration moves such a task: not its issue's state, nor a PR, a push,
 * a status label or an issue import. A reopened task counts as unarchived
 * even before its mark is gone.
 */
export async function hasArchiveMark(
  taskId: string,
  database: Pick<typeof db, "select"> = db,
) {
  const [marked] = await database
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(and(eq(taskTable.id, taskId), taskIsArchived))
    .limit(1);
  return Boolean(marked);
}

/**
 * Whether a task's open/closed state is out of sync: upstream's virtual
 * `archived` status or the archive mark on a closed task.
 */
export async function isStateSyncPaused(
  task: { id: string; status: string },
  database: Pick<typeof db, "select"> = db,
) {
  return (
    isArchivedStatus(task.status) || (await hasArchiveMark(task.id, database))
  );
}
