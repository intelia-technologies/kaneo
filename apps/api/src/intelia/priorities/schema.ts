import { pagingNumber, z } from "../../openapi";
import { PRIORITY_STATUSES } from "../schema";

export const workspaceIdParam = z.object({ workspaceId: z.string() });
export const projectIdParam = z.object({ projectId: z.string() });
export const priorityIdParam = z.object({ priorityId: z.string() });

// Bounds that keep a priority a short text, not a document.
export const PRIORITY_TITLE_MAX = 200;
export const PRIORITY_BODY_MAX = 10_000;
export const PRIORITY_PROJECTS_MAX = 100;

const title = z.string().trim().min(1).max(PRIORITY_TITLE_MAX);
const body = z.string().max(PRIORITY_BODY_MAX).openapi({
  description: "Free text (Markdown) with what the priority means.",
});
const parentId = z.string().min(1).nullable().openapi({
  description:
    "The parent priority, of the same workspace; null for a root. A priority cannot hang from itself or from one of its descendants (409 PRIORITY_CYCLE).",
});
const position = z.number().int().min(0).openapi({
  description:
    "Place among its siblings, from 0. Beyond the last, it goes last. The siblings after it move one place.",
});
const projectIds = z
  .array(z.string().min(1))
  .max(PRIORITY_PROJECTS_MAX)
  .openapi({
    description:
      "Projects of the workspace the priority is linked with; repeated ids count once. The caller must be able to read each one. On edit it replaces the links the caller can read; links to projects it cannot read stay.",
  });

export const createPriorityInput = z.object({
  title,
  body: body.optional(),
  parentId: parentId.optional(),
  position: position.optional().openapi({
    description: "Place among its siblings, from 0; last if omitted.",
  }),
  projectIds: projectIds.optional(),
});

export const updatePriorityInput = z
  .object({
    title: title.optional(),
    body: body.optional(),
    status: z.enum(PRIORITY_STATUSES).optional().openapi({
      description:
        "active or closed. Closing hides it from the boards; its children keep their own status.",
    }),
    parentId: parentId.optional(),
    position: position.optional(),
    projectIds: projectIds.optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: "Nothing to change",
  });

export const listPrioritiesQuery = z.object({
  status: z
    .enum(["active", "all"])
    .optional()
    .openapi({ description: "active, or all (default) with the closed ones." }),
});

export const historyQuery = z.object({
  limit: pagingNumber(1, 200, 50).openapi({
    description: "At most this many changes, newest first (1-200, 50).",
  }),
});

export type CreatePriorityInput = z.infer<typeof createPriorityInput>;
export type UpdatePriorityInput = z.infer<typeof updatePriorityInput>;
