import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import db from "../../database";
import {
  activityTable,
  columnTable,
  projectTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import createComment from "../../activity/controllers/create-comment";
import { canAccessProject } from "../../project-access/can-access-project";
import { taskRequestTable } from "../schema";
import { isCancelledStatus } from "./service";

// What the requester sees of a task they asked for (design 52 §3.2): the task
// and its comments, nothing else of the project. Every check of this file
// answers 404 alike, so a task the caller may not follow is not told apart from
// one that does not exist.
const notFound = () =>
  new ApiError(404, { message: "Request not found", code: "NOT_FOUND" });

const summaryColumns = {
  taskId: taskTable.id,
  title: taskTable.title,
  number: taskTable.number,
  status: taskTable.status,
  statusName: columnTable.name,
  projectId: projectTable.id,
  projectName: projectTable.name,
  projectSlug: projectTable.slug,
  requestedAt: taskRequestTable.requestedAt,
};

type SummaryRow = {
  taskId: string;
  title: string;
  number: number | null;
  status: string;
  statusName: string | null;
  projectId: string;
  projectName: string;
  projectSlug: string;
  requestedAt: Date;
};

const toSummary = ({ number, projectSlug, ...row }: SummaryRow) => ({
  ...row,
  ticketId: number != null ? `${projectSlug}-${number}` : null,
});

/**
 * The request the caller may follow: they are its requester, the task is not
 * cancelled and its project is active, in the workspace the request resolved
 * to. A member of the task's project follows it too, without being requester.
 */
async function findFollowable(
  taskId: string,
  userId: string,
  workspaceId: string,
) {
  const [row] = await db
    .select({
      ...summaryColumns,
      description: taskTable.description,
      requesterUserId: taskRequestTable.requesterUserId,
      requesterName: userTable.name,
      closedAt: taskRequestTable.closedAt,
      archivedAt: projectTable.archivedAt,
      workspaceId: projectTable.workspaceId,
    })
    .from(taskRequestTable)
    .innerJoin(taskTable, eq(taskTable.id, taskRequestTable.taskId))
    .innerJoin(projectTable, eq(projectTable.id, taskTable.projectId))
    .leftJoin(columnTable, eq(columnTable.id, taskTable.columnId))
    .leftJoin(userTable, eq(userTable.id, taskRequestTable.requesterUserId))
    .where(eq(taskRequestTable.taskId, taskId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) throw notFound();
  const asRequester =
    row.requesterUserId === userId &&
    row.closedAt === null &&
    !isCancelledStatus(row.status) &&
    row.archivedAt === null;
  if (!asRequester && !(await canAccessProject(userId, row.projectId))) {
    throw notFound();
  }
  return row;
}

async function listComments(taskId: string) {
  const rows = await db
    .select({
      id: activityTable.id,
      userId: activityTable.userId,
      userName: userTable.name,
      externalUserName: activityTable.externalUserName,
      content: activityTable.content,
      createdAt: activityTable.createdAt,
    })
    .from(activityTable)
    .leftJoin(userTable, eq(userTable.id, activityTable.userId))
    .where(
      and(
        eq(activityTable.taskId, taskId),
        eq(activityTable.type, "comment"),
        isNotNull(activityTable.content),
      ),
    )
    .orderBy(asc(activityTable.createdAt), asc(activityTable.id));
  return rows.map((row) => ({ ...row, content: row.content as string }));
}

export async function getRequestDetail(
  taskId: string,
  userId: string,
  workspaceId: string,
) {
  const row = await findFollowable(taskId, userId, workspaceId);
  return {
    ...toSummary(row),
    description: row.description,
    requester: { userId: row.requesterUserId, name: row.requesterName },
    comments: await listComments(taskId),
  };
}

export async function addRequestComment(
  taskId: string,
  userId: string,
  workspaceId: string,
  content: string,
) {
  await findFollowable(taskId, userId, workspaceId);
  await createComment(taskId, userId, content);
  return getRequestDetail(taskId, userId, workspaceId);
}

/**
 * «Lo que he pedido»: all the caller's requests, in any project, with their
 * state: open ones and also the rejected or cancelled ones, with the reason
 * if there was one. A closed request is listed but not followable: its task
 * and comments stay out of reach (getRequestDetail answers 404).
 */
export async function listMyRequests(userId: string, workspaceId: string) {
  const rows = await db
    .select({
      ...summaryColumns,
      closedAt: taskRequestTable.closedAt,
      closedReason: taskRequestTable.closedReason,
    })
    .from(taskRequestTable)
    .innerJoin(taskTable, eq(taskTable.id, taskRequestTable.taskId))
    .innerJoin(projectTable, eq(projectTable.id, taskTable.projectId))
    .leftJoin(columnTable, eq(columnTable.id, taskTable.columnId))
    .where(
      and(
        eq(taskRequestTable.requesterUserId, userId),
        eq(projectTable.workspaceId, workspaceId),
        isNull(projectTable.archivedAt),
      ),
    )
    .orderBy(desc(taskRequestTable.requestedAt), asc(taskTable.id));
  return {
    requests: rows.map(({ closedAt, closedReason, ...row }) => {
      // Closed by the status, before or without the event that records it.
      const closed = closedAt !== null || isCancelledStatus(row.status);
      return {
        ...toSummary(row),
        state: !closed
          ? ("open" as const)
          : closedReason
            ? ("rejected" as const)
            : ("cancelled" as const),
        closedAt,
        closedReason,
        followable: !closed,
      };
    }),
  };
}
