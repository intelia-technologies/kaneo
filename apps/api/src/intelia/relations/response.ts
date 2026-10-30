import { z } from "../../openapi";

const projectRelationSchema = z
  .object({
    id: z.string(),
    sourceTaskId: z.string(),
    targetTaskId: z.string(),
    relationType: z.string().openapi({
      description:
        "How the two tasks relate: `subtask`, `blocks`, or `related`.",
    }),
  })
  .openapi("ProjectRelation");

const externalTaskSchema = z
  .object({
    id: z.string(),
    number: z.number().nullable(),
    title: z.string(),
    status: z.string(),
    isCompleted: z.boolean().openapi({
      description: "Whether the task is in a final column of its own project.",
    }),
    projectId: z.string(),
    projectSlug: z.string(),
    projectName: z.string(),
  })
  .openapi("ProjectRelationExternalTask");

export const projectRelationsSchema = z
  .object({
    relations: z.array(projectRelationSchema),
    externalTasks: z.array(externalTaskSchema).openapi({
      description: "Endpoints of the relations that belong to other projects.",
    }),
  })
  .openapi("ProjectRelations");
