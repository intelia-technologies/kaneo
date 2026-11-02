import { responseTimestamp, z } from "../../openapi";
import {
  INITIATIVE_CHANGE_KINDS,
  INITIATIVE_CHANGE_SOURCES,
  INITIATIVE_SOURCES,
  TASK_INITIATIVE_CHANGE_SOURCES,
  TASK_ORIGINS,
} from "../schema";

const origin = z.enum(TASK_ORIGINS).openapi({
  description:
    "plan: assigned while the initiative's plan was open. añadido: assigned after it closed. sin_registro: migrated from before initiatives existed. Set by the server, never by hand.",
});

const source = z.enum(INITIATIVE_SOURCES).openapi({
  description:
    "session: a person in Kaneo. api_key: an account's API key, with the `actor` its caller declared, if any. migration: a data migration.",
});

const timestamp = responseTimestamp.nullable();

export const initiativeSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    name: z.string(),
    designUrl: z.string().nullable(),
    approvedBy: z.string().nullable(),
    approvedAt: timestamp,
    createdByUserId: z.string().nullable(),
    createdByName: z.string().nullable(),
    createdByActor: z.string().nullable(),
    source,
    createdAt: responseTimestamp,
    planClosedAt: timestamp.openapi({
      description:
        "When the plan closed: by hand, or when a task of the initiative first reached In progress. Null while planning.",
    }),
  })
  .openapi("Initiative");

export const initiativeChangeSchema = z
  .object({
    id: z.string(),
    initiativeId: z.string(),
    kind: z.enum(INITIATIVE_CHANGE_KINDS),
    previous: z.record(z.string(), z.unknown()).nullable(),
    value: z.record(z.string(), z.unknown()),
    taskId: z.string().nullable().openapi({
      description: "The task whose start closed the plan (`auto`).",
    }),
    source: z.enum(INITIATIVE_CHANGE_SOURCES).openapi({
      description:
        "As in Initiative, plus auto: the plan closed when a task reached In progress.",
    }),
    changedByUserId: z.string().nullable(),
    changedByName: z.string().nullable(),
    changedByActor: z.string().nullable(),
    changedAt: responseTimestamp,
  })
  .openapi("InitiativeChange");

export const initiativeChangeListSchema = z.array(initiativeChangeSchema);

export const taskInitiativeSchema = z
  .object({
    taskId: z.string(),
    initiativeId: z.string(),
    initiativeName: z.string(),
    origin,
    since: responseTimestamp,
    setByUserId: z.string().nullable(),
    setByName: z.string().nullable(),
    setByActor: z.string().nullable(),
    source,
  })
  .openapi("TaskInitiative");

export const taskInitiativeChangeSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    previousInitiativeId: z.string().nullable(),
    previousOrigin: origin.nullable(),
    initiativeId: z.string().nullable().openapi({
      description:
        "Null when the task lost its initiative by leaving the project.",
    }),
    origin: origin.nullable(),
    source: z.enum(TASK_INITIATIVE_CHANGE_SOURCES).openapi({
      description:
        "As in TaskInitiative, plus project_move: the task moved to another project and lost its initiative.",
    }),
    changedByUserId: z.string().nullable(),
    changedByName: z.string().nullable(),
    changedByActor: z.string().nullable(),
    changedAt: responseTimestamp,
  })
  .openapi("TaskInitiativeChange");

export const taskInitiativeChangeListSchema = z.array(
  taskInitiativeChangeSchema,
);
