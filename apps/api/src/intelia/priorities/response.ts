import { responseTimestamp, z } from "../../openapi";
import {
  PRIORITY_CHANGE_KINDS,
  PRIORITY_CHANGE_SOURCES,
  PRIORITY_STATUSES,
} from "../schema";

const status = z.enum(PRIORITY_STATUSES);

export const priorityProjectSchema = z
  .object({ id: z.string(), name: z.string(), slug: z.string() })
  .openapi("PriorityProject");

export const prioritySchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    parentId: z.string().nullable(),
    title: z.string(),
    body: z.string(),
    position: z.number().int(),
    status,
    projects: z.array(priorityProjectSchema).openapi({
      description:
        "Linked projects the caller can read, by name. Links to the others are left out.",
    }),
    createdByUserId: z.string().nullable(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp.openapi({
      description: "When it last changed (creation included).",
    }),
  })
  .openapi("Priority");

export const priorityAncestorSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status,
    updatedAt: responseTimestamp,
  })
  .openapi("PriorityAncestor");

export const priorityWithChainSchema = prioritySchema
  .extend({
    chain: z.array(priorityAncestorSchema).openapi({
      description: "Its ancestors, from the root down to its parent.",
    }),
  })
  .openapi("PriorityWithChain");

export const workspacePrioritiesSchema = z
  .object({
    priorities: z.array(prioritySchema).openapi({
      description:
        "Depth first: each priority right after its parent, siblings by position.",
    }),
  })
  .openapi("WorkspacePriorities");

export const projectPrioritiesSchema = z
  .object({
    priorities: z.array(priorityWithChainSchema).openapi({
      description:
        "The active priorities linked with the project, in tree order, each with its chain to the root.",
    }),
  })
  .openapi("ProjectPriorities");

export const priorityChangeSchema = z
  .object({
    id: z.string(),
    priorityId: z.string(),
    kind: z.enum(PRIORITY_CHANGE_KINDS),
    previous: z.record(z.string(), z.unknown()).nullable().openapi({
      description: "The changed fields before; null on creation.",
    }),
    value: z.record(z.string(), z.unknown()).openapi({
      description:
        "The changed fields after: title, body, status, parentId, position, projectIds.",
    }),
    changedByUserId: z.string().nullable(),
    changedByName: z.string().nullable(),
    source: z.enum(PRIORITY_CHANGE_SOURCES),
    changedAt: responseTimestamp,
  })
  .openapi("PriorityChange");

export const priorityChangeListSchema = z
  .object({ changes: z.array(priorityChangeSchema) })
  .openapi("PriorityChangeList");

export type PriorityResponse = z.infer<typeof prioritySchema>;
export type PriorityAncestor = z.infer<typeof priorityAncestorSchema>;
