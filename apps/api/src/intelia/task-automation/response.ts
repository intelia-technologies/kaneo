import { responseTimestamp, z } from "../../openapi";
import { AUTOMATION_LEVELS, AUTOMATION_SOURCES } from "../schema";

const level = z.enum(AUTOMATION_LEVELS);

const source = z.enum(AUTOMATION_SOURCES).openapi({
  description:
    "session: a person in Kaneo. api_key: set when creating the task with an API key. gateway: the factory's gateway, for `actor`. migration: the one-off backfill of open tasks.",
});

export const taskAutomationSchema = z
  .object({
    taskId: z.string(),
    level,
    verification: z.boolean(),
    source,
    setByUserId: z.string().nullable(),
    setByName: z.string().nullable(),
    setByActor: z.string().nullable().openapi({
      description: "Graph id the gateway acted for; null otherwise.",
    }),
    setAt: responseTimestamp,
  })
  .openapi("TaskAutomation");

export const taskAutomationListSchema = z.array(taskAutomationSchema);

export const taskAutomationChangeSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    previousLevel: level.nullable(),
    previousVerification: z.boolean().nullable(),
    level,
    verification: z.boolean(),
    source,
    changedByUserId: z.string().nullable(),
    changedByName: z.string().nullable(),
    changedByActor: z.string().nullable(),
    changedAt: responseTimestamp,
  })
  .openapi("TaskAutomationChange");

export const taskAutomationChangeListSchema = z.array(
  taskAutomationChangeSchema,
);
