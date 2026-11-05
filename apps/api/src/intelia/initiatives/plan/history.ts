const WORKING = new Set(["in-progress", "in-review"]);

/**
 * A change of column from the activity log: `status_changed`, or `moved` to
 * another project. Both carry `oldStatus` and `newStatus`; callers drop the
 * moves that keep the column.
 */
export const COLUMN_CHANGE_TYPES = ["status_changed", "moved"];

export type StatusChange = {
  at: Date;
  oldStatus: string | null;
  newStatus: string | null;
};

/**
 * Real dates and work of a task from its column changes, oldest first
 * (annex of design 19 §2 and §3.3). The task was created in the column its
 * first change leaves (or, without changes, the one it is in). It starts when
 * it first is in In progress or In review (its creation, if created there),
 * ends on its last move to Done if it is Done, and has worked the time it
 * spent in those two columns, the open stay included.
 */
export function taskHistory(
  task: { status: string; createdAt: Date },
  changes: StatusChange[],
  now: Date,
) {
  const initial = changes.length > 0 ? changes[0]!.oldStatus : task.status;
  let actualStart: Date | null = WORKING.has(initial ?? "")
    ? task.createdAt
    : null;
  let actualEnd: Date | null = null;
  let workedMs = 0;
  let enteredAt = task.createdAt;
  for (const change of changes) {
    if (change.oldStatus && WORKING.has(change.oldStatus)) {
      workedMs += change.at.getTime() - enteredAt.getTime();
    }
    if (!actualStart && change.newStatus && WORKING.has(change.newStatus)) {
      actualStart = change.at;
    }
    if (change.newStatus === "done") actualEnd = change.at;
    enteredAt = change.at;
  }
  if (WORKING.has(task.status)) {
    workedMs += Math.max(now.getTime() - enteredAt.getTime(), 0);
  }
  return {
    actualStart,
    actualEnd: task.status === "done" ? actualEnd : null,
    workedHours: workedMs / 3_600_000,
    /** When it entered its current column: its last change, or creation. */
    statusSince: changes.at(-1)?.at ?? task.createdAt,
  };
}
