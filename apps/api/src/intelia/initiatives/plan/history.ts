const WORKING = new Set(["in-progress", "in-review"]);

export type StatusChange = {
  at: Date;
  oldStatus: string | null;
  newStatus: string | null;
};

/**
 * Real dates and work of a task from its status changes, oldest first
 * (annex of design 19 §2 and §3.3): it starts on its first move to In
 * progress or In review, ends on its last move to Done if it is Done, and has
 * worked the time it spent in those two columns, the open stay included.
 */
export function taskHistory(
  task: { status: string; createdAt: Date },
  changes: StatusChange[],
  now: Date,
) {
  let actualStart: Date | null = null;
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
    // Created straight into the column.
    actualStart ??= task.createdAt;
  }
  return {
    actualStart,
    actualEnd: task.status === "done" ? actualEnd : null,
    workedHours: workedMs / 3_600_000,
  };
}
