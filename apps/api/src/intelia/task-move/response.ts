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
      toColumnId: z.string(),
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
      userId: z.string().nullable(),
      kept: z.boolean().openapi({
        description:
          "False when the assignee has no access to the destination and is unassigned, as upstream's move does.",
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
