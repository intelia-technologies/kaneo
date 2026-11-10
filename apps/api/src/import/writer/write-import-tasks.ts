import type db from "../../database";
import { activityTable, taskTable } from "../../database/schema";
import { taskArchiveTable } from "../../intelia/schema";
import { chunk } from "./chunk";
import type { PlannedImportTask } from "./plan-import-tasks";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function writeImportTasks(
  tx: Transaction,
  projectId: string,
  importedBy: string,
  tasks: readonly PlannedImportTask[],
) {
  for (const batch of chunk(tasks)) {
    await tx.insert(taskTable).values(
      batch.map((task) => ({
        id: task.id,
        projectId,
        number: task.number,
        title: task.title,
        description: task.description,
        status: task.status,
        columnId: task.columnId,
        position: task.position,
        priority: task.priority,
        startDate: task.startDate,
        dueDate: task.dueDate,
        createdAt: task.createdAt,
        userId: task.userId,
      })),
    );

    await tx.insert(activityTable).values(
      batch.map((task) => ({
        taskId: task.id,
        type: "created",
        userId: importedBy,
        content: null,
        eventData: {},
        createdAt: task.createdAt,
      })),
    );

    // Intelia (design 53 §3.2): archived tasks come in closed, with the mark.
    const archived = batch.filter((task) => task.archived);
    if (archived.length > 0)
      await tx.insert(taskArchiveTable).values(
        archived.map((task) => ({
          taskId: task.id,
          archivedByUserId: importedBy,
        })),
      );
  }
}
