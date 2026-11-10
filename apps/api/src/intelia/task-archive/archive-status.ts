import { inArray } from "drizzle-orm";
import type db from "../../database";
import { taskTable } from "../../database/schema";
import { taskIsCompleted } from "../../task/task-is-completed";
import { taskArchiveTable } from "../schema";
import { taskNotClosedError } from "./not-closed";

// Upstream's virtual status. Since design 53 §3.2 it is never written: a
// request for it archives the task with the mark instead.
export const ARCHIVED_STATUS = "archived";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * A status change to `archived` on locked tasks (KF-8). Tasks already in the
 * old status are left alone. Every other task must be closed, or the whole
 * change fails with 409 `TASK_NOT_CLOSED`; those get the archive mark (keeping
 * an earlier one) and their status stays as it is, so the caller writes no
 * status for any of them. Returns the projects of the newly archived tasks,
 * to announce with `announceArchived` once the transaction commits.
 */
export async function archiveInsteadOfStatus(
  tx: Transaction,
  tasks: readonly { id: string; status: string }[],
  userId: string | null | undefined,
): Promise<string[]> {
  const ids = [
    ...new Set(
      tasks
        .filter((task) => task.status !== ARCHIVED_STATUS)
        .map((task) => task.id),
    ),
  ];
  if (ids.length === 0) return [];
  const rows = await tx
    .select({
      id: taskTable.id,
      projectId: taskTable.projectId,
      status: taskTable.status,
      completed: taskIsCompleted,
    })
    .from(taskTable)
    .where(inArray(taskTable.id, ids));
  const open = rows.filter((row) => !row.completed);
  if (open.length > 0) throw taskNotClosedError(open);
  const inserted = await tx
    .insert(taskArchiveTable)
    .values(ids.map((taskId) => ({ taskId, archivedByUserId: userId || null })))
    .onConflictDoNothing({ target: taskArchiveTable.taskId })
    .returning({ taskId: taskArchiveTable.taskId });
  const newly = new Set(inserted.map((row) => row.taskId));
  return [
    ...new Set(
      rows.filter((row) => newly.has(row.id)).map((row) => row.projectId),
    ),
  ];
}
