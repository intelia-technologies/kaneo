import { and, asc, desc, eq, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable, taskTable, userTable } from "../../database/schema";
import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { routineRunTable, routineTable } from "../schema";
import {
  routineRunListSchema,
  routineSchema,
  workspaceRoutineListSchema,
} from "./response";
import { nextRunAt, scheduleError } from "./schedule";
import {
  routineInput,
  routineRunsQuery,
  taskIdParam,
  workspaceIdParam,
} from "./schema";
import "./subscribe";

const owner = alias(userTable, "routine_owner");
const assignee = alias(userTable, "routine_assignee");

const routineColumns = {
  ...getTableColumns(routineTable),
  ownerName: owner.name,
};

async function getRoutine(taskId: string) {
  const [routine] = await db
    .select(routineColumns)
    .from(routineTable)
    .leftJoin(owner, eq(routineTable.ownerId, owner.id))
    .where(eq(routineTable.taskId, taskId))
    .limit(1);
  if (!routine) throw new HTTPException(404, { message: "Routine not found" });
  return routine;
}

function listWorkspaceRoutines(workspaceId: string, userId: string) {
  return db
    .select({
      ...routineColumns,
      task: {
        id: taskTable.id,
        number: taskTable.number,
        title: taskTable.title,
        status: taskTable.status,
        projectId: projectTable.id,
        projectName: projectTable.name,
        projectSlug: projectTable.slug,
        assigneeId: taskTable.userId,
        assigneeName: assignee.name,
      },
    })
    .from(routineTable)
    .innerJoin(taskTable, eq(routineTable.taskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(owner, eq(routineTable.ownerId, owner.id))
    .leftJoin(assignee, eq(taskTable.userId, assignee.id))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        projectAccessCondition(userId, projectTable.id),
      ),
    )
    .orderBy(asc(routineTable.nextRunAt), asc(routineTable.id));
}

async function putRoutine(
  taskId: string,
  ownerId: string,
  input: { cron: string; timezone: string; active: boolean },
) {
  const [task] = await db
    .select({ recurrence: taskTable.recurrence })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);
  if (!task) throw new HTTPException(404, { message: "Task not found" });
  if (task.recurrence) {
    throw new HTTPException(409, {
      message:
        "The task already repeats with Kaneo's recurrence; remove it before scheduling a routine",
    });
  }
  const invalid = scheduleError(input.cron, input.timezone);
  if (invalid) throw new HTTPException(400, { message: invalid });

  const now = new Date();
  const values = {
    cron: input.cron,
    timezone: input.timezone,
    active: input.active,
    ownerId,
    nextRunAt: nextRunAt(input.cron, input.timezone, now),
    updatedAt: now,
  };
  await db
    .insert(routineTable)
    .values({ taskId, ...values })
    .onConflictDoUpdate({ target: routineTable.taskId, set: values });
  return getRoutine(taskId);
}

async function deleteRoutine(taskId: string) {
  const routine = await getRoutine(taskId);
  await db.delete(routineTable).where(eq(routineTable.id, routine.id));
  return routine;
}

async function listRuns(taskId: string, limit: number) {
  const routine = await getRoutine(taskId);
  return db
    .select()
    .from(routineRunTable)
    .where(eq(routineRunTable.routineId, routine.id))
    .orderBy(desc(routineRunTable.scheduledAt), desc(routineRunTable.id))
    .limit(limit);
}

const listWorkspaceRoutinesRoute = createRoute({
  method: "get",
  operationId: "listWorkspaceRoutines",
  path: "/workspace/{workspaceId}/routines",
  tags: ["Routines"],
  summary: "List workspace routines",
  description:
    "Every routine in the workspace's projects the caller can see, with its task and assignee, soonest next run first.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse("Routines of the workspace", workspaceRoutineListSchema),
    403: errorResponse("Missing read permission"),
    404: errorResponse("Workspace not found or not a member"),
  },
});

const getRoutineRoute = createRoute({
  method: "get",
  operationId: "getTaskRoutine",
  path: "/task/{taskId}/routine",
  tags: ["Routines"],
  summary: "Get task routine",
  description: "The schedule that reopens the task to In progress.",
  middleware: [
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: taskIdParam },
  responses: {
    200: jsonResponse("The task's routine", routineSchema),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Task or routine not found"),
  },
});

const putRoutineRoute = createRoute({
  method: "put",
  operationId: "putTaskRoutine",
  path: "/task/{taskId}/routine",
  tags: ["Routines"],
  summary: "Schedule task routine",
  description:
    "Create or replace the task's routine; `active: false` pauses it. The caller becomes its owner and the next run is computed from now. Rejected if the task uses Kaneo's recurrence.",
  middleware: [
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: routineInput } },
    },
  },
  responses: {
    200: jsonResponse("The scheduled routine", routineSchema),
    400: errorResponse("Invalid cron expression or time zone"),
    403: errorResponse("No access to the project or missing task:update"),
    404: errorResponse("Task not found"),
    409: errorResponse("The task uses Kaneo's recurrence"),
  },
});

const deleteRoutineRoute = createRoute({
  method: "delete",
  operationId: "deleteTaskRoutine",
  path: "/task/{taskId}/routine",
  tags: ["Routines"],
  summary: "Remove task routine",
  description: "Remove the task's routine and its history.",
  middleware: [
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: { params: taskIdParam },
  responses: {
    200: jsonResponse("The removed routine", routineSchema),
    403: errorResponse("No access to the project or missing task:update"),
    404: errorResponse("Task or routine not found"),
  },
});

const listRunsRoute = createRoute({
  method: "get",
  operationId: "listTaskRoutineRuns",
  path: "/task/{taskId}/routine/runs",
  tags: ["Routines"],
  summary: "Get task routine history",
  description: "The routine's runs, newest first.",
  middleware: [
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: taskIdParam, query: routineRunsQuery },
  responses: {
    200: jsonResponse("Runs of the routine", routineRunListSchema),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Task or routine not found"),
  },
});

const routines = apiRouter()
  .openapi(listWorkspaceRoutinesRoute, async (c) =>
    c.json(
      await listWorkspaceRoutines(
        c.req.valid("param").workspaceId,
        c.get("userId"),
      ),
      200,
    ),
  )
  .openapi(getRoutineRoute, async (c) =>
    c.json(await getRoutine(c.req.valid("param").taskId), 200),
  )
  .openapi(putRoutineRoute, async (c) =>
    c.json(
      await putRoutine(
        c.req.valid("param").taskId,
        c.get("userId"),
        c.req.valid("json"),
      ),
      200,
    ),
  )
  .openapi(deleteRoutineRoute, async (c) =>
    c.json(await deleteRoutine(c.req.valid("param").taskId), 200),
  )
  .openapi(listRunsRoute, async (c) =>
    c.json(
      await listRuns(c.req.valid("param").taskId, c.req.valid("query").limit),
      200,
    ),
  );

export default routines;
