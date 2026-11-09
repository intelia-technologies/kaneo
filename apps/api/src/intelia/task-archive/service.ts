import { and, asc, eq, inArray, sql } from "drizzle-orm";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import { publishEvent } from "../../events";
import { taskIsCompleted } from "../../task/task-is-completed";
import { taskArchiveTable } from "../schema";

export const TASKS_ARCHIVED_EVENT = "intelia.tasks_archived";

type Caller = { userId: string; workspaceId: string };

// The ids must all be tasks of the caller's workspace: the access middleware
// only checks the ones it finds, so an unknown id would otherwise pass
// silently.
async function lockTasks(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  taskIds: string[],
  workspaceId: string,
) {
  const rows = await tx
    .select({
      id: taskTable.id,
      projectId: taskTable.projectId,
      number: taskTable.number,
      status: taskTable.status,
      completed: taskIsCompleted,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(projectTable.id, taskTable.projectId))
    .where(
      and(
        inArray(taskTable.id, taskIds),
        eq(projectTable.workspaceId, workspaceId),
      ),
    )
    .orderBy(asc(taskTable.id))
    .for("update", { of: taskTable });
  if (rows.length !== taskIds.length) {
    throw new ApiError(404, {
      code: "NOT_FOUND",
      message: `${taskIds.length - rows.length} of the tasks were not found`,
    });
  }
  return rows;
}

async function announce(projectIds: Iterable<string>) {
  for (const projectId of new Set(projectIds))
    await publishEvent(TASKS_ARCHIVED_EVENT, { projectId });
}

/**
 * Archives up to 100 closed tasks in one transaction. Idempotent: a task
 * already archived keeps its first `archivedAt`. A task outside a final column
 * fails the whole batch with 409 `TASK_NOT_CLOSED`, nothing archived.
 */
export async function archiveTasks(ids: string[], caller: Caller) {
  const taskIds = [...new Set(ids)];
  const { rows, inserted } = await db.transaction(async (tx) => {
    const rows = await lockTasks(tx, taskIds, caller.workspaceId);
    const open = rows.filter((row) => !row.completed);
    if (open.length > 0) {
      throw new ApiError(409, {
        code: "TASK_NOT_CLOSED",
        message: `Only tasks in a final column can be archived; nothing was archived. Open: ${open
          .map((row) => `${row.id} (${row.status})`)
          .join(", ")}`,
      });
    }
    const inserted = await tx
      .insert(taskArchiveTable)
      .values(
        taskIds.map((taskId) => ({ taskId, archivedByUserId: caller.userId })),
      )
      .onConflictDoNothing({ target: taskArchiveTable.taskId })
      .returning({ taskId: taskArchiveTable.taskId });
    return { rows, inserted };
  });

  const marks = await db
    .select({
      taskId: taskArchiveTable.taskId,
      archivedAt: taskArchiveTable.archivedAt,
    })
    .from(taskArchiveTable)
    .where(inArray(taskArchiveTable.taskId, taskIds))
    .orderBy(asc(taskArchiveTable.taskId));

  if (inserted.length > 0) {
    const newly = new Set(inserted.map((row) => row.taskId));
    await announce(
      rows.filter((row) => newly.has(row.id)).map((row) => row.projectId),
    );
  }
  return { archivedCount: inserted.length, tasks: marks };
}

/** The reverse: drops the mark; tasks without one are left alone. */
export async function unarchiveTasks(ids: string[], caller: Caller) {
  const taskIds = [...new Set(ids)];
  const { rows, removed } = await db.transaction(async (tx) => {
    const rows = await lockTasks(tx, taskIds, caller.workspaceId);
    const removed = await tx
      .delete(taskArchiveTable)
      .where(inArray(taskArchiveTable.taskId, taskIds))
      .returning({ taskId: taskArchiveTable.taskId });
    return { rows, removed };
  });
  if (removed.length > 0) {
    const gone = new Set(removed.map((row) => row.taskId));
    await announce(
      rows.filter((row) => gone.has(row.id)).map((row) => row.projectId),
    );
  }
  return {
    unarchivedCount: removed.length,
    taskIds: removed.map((row) => row.taskId).sort(),
  };
}

/**
 * A task that leaves its final column (reopened by hand, by a routine, by an
 * integration) is no longer archived. One statement, so a re-archive after the
 * reopen cannot be undone by a late event.
 */
export async function dropArchiveIfReopened({
  taskId,
  projectId,
}: {
  taskId: string;
  projectId?: string;
}) {
  if (!taskId) return;
  const removed = await db
    .delete(taskArchiveTable)
    .where(
      and(
        eq(taskArchiveTable.taskId, taskId),
        sql`not exists (
          select 1 from ${taskTable}
          where ${taskTable.id} = ${taskArchiveTable.taskId} and ${taskIsCompleted}
        )`,
      ),
    )
    .returning({ taskId: taskArchiveTable.taskId });
  if (removed.length > 0 && projectId) await announce([projectId]);
}
