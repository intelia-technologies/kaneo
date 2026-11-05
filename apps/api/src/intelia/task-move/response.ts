import { responseTimestamp, z } from "../../openapi";

const ticketRef = z.object({
  projectId: z.string(),
  projectSlug: z.string(),
  projectName: z.string(),
  number: z.number().nullable(),
  ticketId: z.string().nullable().openapi({ example: "SF-745" }),
});

export const moveTaskResultSchema = z
  .object({
    dryRun: z.boolean(),
    taskId: z.string(),
    from: ticketRef,
    to: ticketRef.extend({
      number: z.number(),
      ticketId: z.string().openapi({ example: "INFRA-12" }),
    }),
    column: z.object({
      slug: z.string(),
      name: z.string(),
      fromColumnId: z.string().nullable(),
      toColumnId: z.string().nullable().openapi({
        description:
          "Null for an archived or planned task: it keeps its status, without a column.",
      }),
    }),
    customFields: z.array(
      z.object({
        name: z.string(),
        value: z.string().nullable(),
        fromFieldId: z.string(),
        toFieldId: z.string().nullable(),
        action: z.enum(["kept", "discarded"]),
      }),
    ),
    labels: z.array(
      z.object({
        name: z.string(),
        action: z.literal("kept").openapi({
          description:
            "Labels belong to the workspace, which a move never leaves: they stay as they are.",
        }),
      }),
    ),
    initiative: z
      .object({
        name: z.string(),
        fromInitiativeId: z.string(),
        toInitiativeId: z.string().openapi({
          description: "In a dry run, an id that was rolled back if `created`.",
        }),
        created: z.boolean(),
      })
      .nullable(),
    assignee: z.object({
      userId: z.string().nullable().openapi({
        description:
          "Kept as it is; an assignee without access to the destination makes the move fail.",
      }),
    }),
    kept: z.array(z.string()).openapi({
      description: "What stays untouched because it hangs from the task's id.",
    }),
  })
  .openapi("InteliaMoveTaskResult");

export const taskAliasListSchema = z
  .object({
    aliases: z.array(
      z.object({
        ticketId: z.string().openapi({ example: "SF-745" }),
        projectId: z.string(),
        projectSlug: z.string(),
        projectName: z.string(),
        number: z.number(),
        movedAt: responseTimestamp,
      }),
    ),
  })
  .openapi("InteliaTaskAliases");
