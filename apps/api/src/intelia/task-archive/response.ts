import { responseTimestamp, z } from "../../openapi";

export const archiveTasksResultSchema = z
  .object({
    archivedCount: z.number().int().nonnegative().openapi({
      description:
        "Tasks this call archived; those already archived are not counted.",
    }),
    tasks: z.array(
      z.object({
        taskId: z.string(),
        archivedAt: responseTimestamp.openapi({
          description:
            "When the task was archived: the first archive, kept on later calls.",
        }),
      }),
    ),
  })
  .openapi("ArchiveTasksResult");

export const unarchiveTasksResultSchema = z
  .object({
    unarchivedCount: z.number().int().nonnegative().openapi({
      description:
        "Tasks this call unarchived; those not archived are not counted.",
    }),
    taskIds: z.array(z.string()),
  })
  .openapi("UnarchiveTasksResult");
