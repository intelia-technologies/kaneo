import { z } from "../../openapi";

export const MAX_ARCHIVE_BATCH = 100;

export const ARCHIVED_SCOPES = ["exclude", "include", "only"] as const;
export type ArchivedScope = (typeof ARCHIVED_SCOPES)[number];

export const archiveTasksInput = z.object({
  taskIds: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_ARCHIVE_BATCH)
    .openapi({
      description: `From 1 to ${MAX_ARCHIVE_BATCH} task ids, all of one workspace. Repeated ids count once.`,
    }),
});
