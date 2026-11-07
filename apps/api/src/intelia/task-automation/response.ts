import { responseTimestamp, z } from "../../openapi";
import {
  AUTOMATION_LEVELS,
  AUTOMATION_SOURCES,
  DELIVERY_KINDS,
} from "../schema";

const entrega = z.enum(DELIVERY_KINDS).nullable();

const level = z.enum(AUTOMATION_LEVELS);

const source = z.enum(AUTOMATION_SOURCES).openapi({
  description:
    "session: a person in Kaneo. api_key: an account's API key (at creation or on a change), with the `actor` its caller declared, if any. migration: the one-off backfill of open tasks. gateway: no longer written (the former service token).",
});

export const taskAutomationSchema = z
  .object({
    taskId: z.string(),
    level,
    verification: z.boolean(),
    automatica: z.boolean().openapi({
      description:
        "Design 48 §3.2. Yes: the dispatcher moves the columns; no: the responsible does. `level` is its former value for the old engine.",
    }),
    pausaMotivo: z.string().nullable().openapi({
      description: "Why it is paused; null if it is not.",
    }),
    entrega,
    responsable: z.string().nullable(),
    implementador: z.string().nullable(),
    verificador: z.string().nullable(),
    columnaPrevia: z.string().nullable(),
    source,
    setByUserId: z.string().nullable(),
    setByName: z.string().nullable(),
    setByActor: z.string().nullable().openapi({
      description:
        "Graph id an API key's caller declared it acts for (informative, not checked by Kaneo); null otherwise.",
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
    previousAutomatica: z.boolean().nullable(),
    automatica: z.boolean(),
    pausaMotivo: z.string().nullable(),
    entrega,
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
