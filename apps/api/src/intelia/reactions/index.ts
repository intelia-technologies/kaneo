import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { activityTable, userTable } from "../../database/schema";
import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { commentReactionTable } from "../schema";
import { reactionListSchema, reactionSchema } from "./response";
import { idParam, reactionInput } from "./schema";

// A reaction targets a comment, or the task card itself when commentId is null.
type Target = { taskId: string; commentId: string | null };
type ReactionInput = { emoji: string; externalUserName?: string };

function listReactions(where: SQL | undefined) {
  return db
    .select({
      id: commentReactionTable.id,
      taskId: commentReactionTable.taskId,
      commentId: commentReactionTable.commentId,
      emoji: commentReactionTable.emoji,
      userId: commentReactionTable.userId,
      userName: userTable.name,
      externalUserName: commentReactionTable.externalUserName,
      createdAt: commentReactionTable.createdAt,
    })
    .from(commentReactionTable)
    .leftJoin(userTable, eq(commentReactionTable.userId, userTable.id))
    .where(where)
    .orderBy(asc(commentReactionTable.createdAt), asc(commentReactionTable.id));
}

async function commentTarget(id: string): Promise<Target> {
  const [comment] = await db
    .select({ taskId: activityTable.taskId })
    .from(activityTable)
    .where(and(eq(activityTable.id, id), eq(activityTable.type, "comment")))
    .limit(1);
  if (!comment) throw new HTTPException(404, { message: "Comment not found" });
  return { taskId: comment.taskId, commentId: id };
}

// The caller's own reaction: as themself, or as a named external actor, which
// requires the same permission as externalUserName on comments.
async function ownReactionFilter(
  c: Context,
  target: Target,
  { emoji, externalUserName }: ReactionInput,
) {
  if (
    externalUserName &&
    !(await hasWorkspacePermission(c, { workspace: ["manage_settings"] }))
  ) {
    throw new HTTPException(403, {
      message:
        "Reacting as an external actor requires workspace:manage_settings permission",
    });
  }
  return and(
    eq(commentReactionTable.taskId, target.taskId),
    target.commentId === null
      ? isNull(commentReactionTable.commentId)
      : eq(commentReactionTable.commentId, target.commentId),
    eq(commentReactionTable.emoji, emoji),
    eq(commentReactionTable.userId, c.get("userId")),
    externalUserName
      ? eq(commentReactionTable.externalUserName, externalUserName)
      : isNull(commentReactionTable.externalUserName),
  );
}

async function addReaction(c: Context, target: Target, input: ReactionInput) {
  const own = await ownReactionFilter(c, target, input);
  await db
    .insert(commentReactionTable)
    .values({
      ...target,
      emoji: input.emoji,
      userId: c.get("userId"),
      externalUserName: input.externalUserName ?? null,
    })
    .onConflictDoNothing();
  const [reaction] = await listReactions(own);
  if (!reaction) throw new HTTPException(404, { message: "Target not found" });
  return reaction;
}

async function removeReaction(
  c: Context,
  target: Target,
  input: ReactionInput,
) {
  const [reaction] = await listReactions(
    await ownReactionFilter(c, target, input),
  );
  if (!reaction) {
    throw new HTTPException(404, { message: "Reaction not found" });
  }
  const [deleted] = await db
    .delete(commentReactionTable)
    .where(eq(commentReactionTable.id, reaction.id))
    .returning({ id: commentReactionTable.id });
  if (!deleted) {
    throw new HTTPException(404, { message: "Reaction not found" });
  }
  return reaction;
}

const listCommentReactionsRoute = createRoute({
  method: "get",
  operationId: "listCommentReactions",
  path: "/comment/{id}/reactions",
  tags: ["Reactions"],
  summary: "Get comment reactions",
  description: "Get all reactions on a comment, oldest first.",
  middleware: [
    workspaceAccess.fromComment(),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: idParam },
  responses: {
    200: jsonResponse("List of reactions for the comment", reactionListSchema),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Comment not found"),
  },
});

const addCommentReactionRoute = createRoute({
  method: "post",
  operationId: "addCommentReaction",
  path: "/comment/{id}/reactions",
  tags: ["Reactions"],
  summary: "Add comment reaction",
  description: "React to a comment with an emoji. Idempotent.",
  middleware: [
    workspaceAccess.fromComment(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: idParam,
    body: {
      required: true,
      content: { "application/json": { schema: reactionInput } },
    },
  },
  responses: {
    200: jsonResponse("The added or existing reaction", reactionSchema),
    400: errorResponse("Invalid body or emoji"),
    403: errorResponse(
      "No access, missing task:update, or external actor without workspace:manage_settings",
    ),
    404: errorResponse("Comment not found"),
  },
});

const removeCommentReactionRoute = createRoute({
  method: "delete",
  operationId: "removeCommentReaction",
  path: "/comment/{id}/reactions",
  tags: ["Reactions"],
  summary: "Remove comment reaction",
  description: "Remove the caller's reaction from a comment.",
  middleware: [
    workspaceAccess.fromComment(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: idParam,
    query: reactionInput,
  },
  responses: {
    200: jsonResponse("The removed reaction", reactionSchema),
    400: errorResponse("Invalid query or emoji"),
    403: errorResponse(
      "No access, missing task:update, or external actor without workspace:manage_settings",
    ),
    404: errorResponse("Reaction not found"),
  },
});

const listTaskReactionsRoute = createRoute({
  method: "get",
  operationId: "listTaskReactions",
  path: "/task/{id}/reactions",
  tags: ["Reactions"],
  summary: "Get task reactions",
  description:
    "Get all reactions for a task, including card reactions and reactions on its comments, oldest first.",
  middleware: [
    workspaceAccess.fromTask("id"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: idParam },
  responses: {
    200: jsonResponse(
      "List of all reactions for the task and its comments",
      reactionListSchema,
    ),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Task not found"),
  },
});

const addTaskReactionRoute = createRoute({
  method: "post",
  operationId: "addTaskReaction",
  path: "/task/{id}/reactions",
  tags: ["Reactions"],
  summary: "Add task reaction",
  description: "React to a task card with an emoji. Idempotent.",
  middleware: [
    workspaceAccess.fromTask("id"),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: idParam,
    body: {
      required: true,
      content: { "application/json": { schema: reactionInput } },
    },
  },
  responses: {
    200: jsonResponse("The added or existing card reaction", reactionSchema),
    400: errorResponse("Invalid body or emoji"),
    403: errorResponse(
      "No access, missing task:update, or external actor without workspace:manage_settings",
    ),
    404: errorResponse("Task not found"),
  },
});

const removeTaskReactionRoute = createRoute({
  method: "delete",
  operationId: "removeTaskReaction",
  path: "/task/{id}/reactions",
  tags: ["Reactions"],
  summary: "Remove task reaction",
  description: "Remove the caller's reaction from a task card.",
  middleware: [
    workspaceAccess.fromTask("id"),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: idParam,
    query: reactionInput,
  },
  responses: {
    200: jsonResponse("The removed card reaction", reactionSchema),
    400: errorResponse("Invalid query or emoji"),
    403: errorResponse(
      "No access, missing task:update, or external actor without workspace:manage_settings",
    ),
    404: errorResponse("Reaction not found"),
  },
});

const reactions = apiRouter()
  .openapi(listCommentReactionsRoute, async (c) =>
    c.json(
      await listReactions(
        eq(commentReactionTable.commentId, c.req.valid("param").id),
      ),
      200,
    ),
  )
  .openapi(addCommentReactionRoute, async (c) =>
    c.json(
      await addReaction(
        c,
        await commentTarget(c.req.valid("param").id),
        c.req.valid("json"),
      ),
      200,
    ),
  )
  .openapi(removeCommentReactionRoute, async (c) =>
    c.json(
      await removeReaction(
        c,
        await commentTarget(c.req.valid("param").id),
        c.req.valid("query"),
      ),
      200,
    ),
  )
  .openapi(listTaskReactionsRoute, async (c) =>
    c.json(
      await listReactions(
        eq(commentReactionTable.taskId, c.req.valid("param").id),
      ),
      200,
    ),
  )
  .openapi(addTaskReactionRoute, async (c) =>
    c.json(
      await addReaction(
        c,
        { taskId: c.req.valid("param").id, commentId: null },
        c.req.valid("json"),
      ),
      200,
    ),
  )
  .openapi(removeTaskReactionRoute, async (c) =>
    c.json(
      await removeReaction(
        c,
        { taskId: c.req.valid("param").id, commentId: null },
        c.req.valid("query"),
      ),
      200,
    ),
  );

export default reactions;
