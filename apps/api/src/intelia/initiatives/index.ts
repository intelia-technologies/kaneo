import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { z } from "../../openapi";
import { initiativeAccess, initiativeReader, initiativeWriter } from "./access";
import { getInitiativePlan } from "./plan/read";
import { initiativePlanSchema } from "./plan/response";
import {
  getInitiativeDetail,
  getTaskInitiatives,
  listInitiativeOptions,
  listInitiativesWithCounters,
} from "./read";
import {
  deletedInitiativeSchema,
  initiativeChangeListSchema,
  initiativeDetailSchema,
  initiativeOptionsSchema,
  initiativeSchema,
  projectInitiativesSchema,
  taskInitiativeChangeListSchema,
  taskInitiativeSchema,
  taskInitiativesSchema,
} from "./response";
import {
  closePlanInput,
  createInitiativeInput,
  historyQuery,
  initiativeIdParam,
  projectIdParam,
  putTaskInitiativeInput,
  taskIdParam,
  taskInitiativesInput,
  updateInitiativeInput,
  workspaceIdParam,
} from "./schema";
import {
  closePlan,
  createInitiative,
  deleteInitiative,
  getTaskInitiative,
  listInitiativeChanges,
  listTaskInitiativeChanges,
  setTaskInitiative,
  updateInitiative,
} from "./service";

const tags = ["Initiatives"];

const WRITERS =
  "A person's session or an account's API key, with task:update. Kaneo does not check who may write beyond that: the factory's gateway does, before calling (design 19 §3). With an API key, `actor` names who the caller acts for (informative, logged as given).";

const writeErrors = {
  401: errorResponse("No session or API key"),
  403: errorResponse("No access to the project or missing task:update"),
};

const createRouteDef = createRoute({
  method: "post",
  operationId: "createInitiative",
  path: "/project/{projectId}/initiatives",
  tags,
  summary: "Create an initiative",
  description: `A new initiative of the project, with its plan open. ${WRITERS}`,
  middleware: initiativeAccess.writeOnProject(),
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: createInitiativeInput } },
    },
  },
  responses: {
    201: jsonResponse("The new initiative", initiativeSchema),
    400: errorResponse("Invalid body, or `actor` from a session"),
    ...writeErrors,
    404: errorResponse("Project not found"),
    409: errorResponse(
      "The project already has an initiative with that name (INITIATIVE_NAME_TAKEN)",
    ),
  },
});

const updateRouteDef = createRoute({
  method: "patch",
  operationId: "updateInitiative",
  path: "/initiative/{initiativeId}",
  tags,
  summary: "Edit an initiative",
  description: `Changes its name, objective, external milestones, shared state (\`estado_compartido\`), design link or approval; each real change goes to the change log. ${WRITERS}`,
  middleware: initiativeAccess.writeOnInitiative(),
  request: {
    params: initiativeIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateInitiativeInput } },
    },
  },
  responses: {
    200: jsonResponse("The initiative", initiativeSchema),
    400: errorResponse("Invalid body, or `actor` from a session"),
    ...writeErrors,
    404: errorResponse("Initiative not found"),
    409: errorResponse(
      "The project already has an initiative with that name (INITIATIVE_NAME_TAKEN)",
    ),
  },
});

const closePlanRouteDef = createRoute({
  method: "post",
  operationId: "closeInitiativePlan",
  path: "/initiative/{initiativeId}/close-plan",
  tags,
  summary: "Close an initiative's plan",
  description: `From now on, tasks put in the initiative are \`añadido\`. Closing a closed plan changes nothing. The plan also closes on its own when a task of the initiative reaches In progress. ${WRITERS}`,
  middleware: initiativeAccess.writeOnInitiative(),
  request: {
    params: initiativeIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: closePlanInput } },
    },
  },
  responses: {
    200: jsonResponse("The initiative", initiativeSchema),
    400: errorResponse("`actor` from a session"),
    ...writeErrors,
    404: errorResponse("Initiative not found"),
  },
});

const deleteRouteDef = createRoute({
  method: "delete",
  operationId: "deleteInitiative",
  path: "/initiative/{initiativeId}",
  tags,
  summary: "Delete an empty initiative",
  description: `Only an initiative with no tasks, or with only Cancelled ones: those stay in the project without initiative, each with a row in its initiative log, and the initiative goes with its own change log. Every task counts, readable by the caller or not. ${WRITERS} The body is optional.`,
  middleware: initiativeAccess.writeOnInitiative(),
  request: {
    params: initiativeIdParam,
    body: {
      required: false,
      content: { "application/json": { schema: closePlanInput } },
    },
  },
  responses: {
    200: jsonResponse(
      "The deleted initiative and the tasks it left",
      deletedInitiativeSchema,
    ),
    400: errorResponse("Invalid body, or `actor` from a session"),
    ...writeErrors,
    404: errorResponse("Initiative not found"),
    409: errorResponse(
      "The initiative still has tasks that are not Cancelled (INITIATIVE_NOT_EMPTY)",
    ),
  },
});

// Reads (design 19 §6, design 52 §3.1): the same authorization as the rest of
// Kaneo, with one filter of readable projects for tasks and dependencies.
const READERS =
  "Needs task:read and access to the project. Tasks of projects the caller cannot read count in the counters (and in `counters.hidden`), but are left out of every list and dependency, without any of their data.";

const listRouteDef = createRoute({
  method: "get",
  operationId: "listProjectInitiatives",
  path: "/project/{projectId}/initiatives",
  tags,
  summary: "List a project's initiatives with their counters",
  description: `Every initiative of the project, oldest first, with its derived state, counters (active, done, cancelled, blocked; plan, added and unrecorded) and its Blocked tasks with their reason, plus the tasks without initiative. One call for the whole listing. ${READERS}`,
  middleware: initiativeAccess.readOnProject(),
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse("The project's initiatives", projectInitiativesSchema),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Project not found"),
  },
});

const optionsRouteDef = createRoute({
  method: "get",
  operationId: "listInitiativeOptions",
  path: "/project/{projectId}/initiative-options",
  tags,
  summary: "List the initiatives a task of the project can join",
  description:
    "The initiatives of every project of the project's workspace that the caller can read, with their project, for the task's initiative selector (design 52 §3.1). Needs task:read and access to the project.",
  middleware: initiativeAccess.readOnProject(),
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse("The initiatives", initiativeOptionsSchema),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Project not found"),
  },
});

const detailRouteDef = createRoute({
  method: "get",
  operationId: "getInitiativeDetail",
  path: "/initiative/{initiativeId}",
  tags,
  summary: "Get an initiative with its tasks",
  description: `The initiative, its counters and its tasks with origin, status, assignee, «no status change since» (from the activity log), block reason and \`blocks\` dependencies, the readable tasks outside it that they touch, and the longest pending chain. ${READERS} A pending task with a dependency left out marks the chain partial.`,
  middleware: initiativeAccess.readOnInitiative(),
  request: { params: initiativeIdParam },
  responses: {
    200: jsonResponse("The initiative and its tasks", initiativeDetailSchema),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Initiative not found"),
  },
});

const planRouteDef = createRoute({
  method: "get",
  operationId: "getInitiativePlan",
  path: "/initiative/{initiativeId}/plan",
  tags,
  summary: "Get an initiative's estimated plan and critical path",
  description: `Real start and end of each task, its estimate (the median of similar finished tasks, or its \`estimacion_horas\`), planned dates chained along \`blocks\` from now, the critical path by hours with the mark of each pending task, and the estimated end (annex of design 19). The finished tasks behind the medians are read at most every 10 minutes. ${READERS} Estimates learn only from tasks the caller can read.`,
  middleware: initiativeAccess.readOnInitiative(),
  request: {
    params: initiativeIdParam,
    query: z.object({
      projectIds: z.string().optional().openapi({
        description:
          "Comma-separated project IDs to intersect with the caller's readable projects; empty means none.",
      }),
    }),
  },
  responses: {
    200: jsonResponse("The initiative's plan", initiativePlanSchema),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Initiative not found"),
  },
});

const initiativeHistoryRouteDef = createRoute({
  method: "get",
  operationId: "listInitiativeChanges",
  path: "/initiative/{initiativeId}/history",
  tags,
  summary: "Get an initiative's change log",
  description: "Creation, edits and plan closing, newest first.",
  middleware: initiativeAccess.readOnInitiative(),
  request: { params: initiativeIdParam, query: historyQuery },
  responses: {
    200: jsonResponse("Changes of the initiative", initiativeChangeListSchema),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Initiative not found"),
  },
});

const putTaskRouteDef = createRoute({
  method: "put",
  operationId: "putTaskInitiative",
  path: "/task/{taskId}/initiative",
  tags,
  summary: "Set a task's initiative",
  description: `Puts the task in an initiative of any project of its workspace; for one of another project, the caller must also be able to read that project (design 52 §3.1). The server sets its origin against that initiative's plan (\`plan\` while open, \`añadido\` once closed) and logs the move. Its current initiative changes nothing. ${WRITERS}`,
  middleware: initiativeAccess.writeOnTask(),
  request: {
    params: taskIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: putTaskInitiativeInput } },
    },
  },
  responses: {
    200: jsonResponse("The task's initiative", taskInitiativeSchema),
    400: errorResponse(
      "Invalid body, `actor` from a session, or an initiative that does not exist, is of another workspace or of a project the caller cannot read (INITIATIVE_NOT_FOUND)",
    ),
    ...writeErrors,
    404: errorResponse("Task not found"),
  },
});

const getTaskRouteDef = createRoute({
  method: "get",
  operationId: "getTaskInitiative",
  path: "/task/{taskId}/initiative",
  tags,
  summary: "Get a task's initiative",
  description:
    "The task's initiative and origin, with who set them and when. The initiative may be of another project; its name is null when the caller cannot read that project.",
  middleware: initiativeAccess.readOnTask(),
  request: { params: taskIdParam },
  responses: {
    200: jsonResponse("The task's initiative", taskInitiativeSchema),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Task not found or without initiative"),
  },
});

const taskHistoryRouteDef = createRoute({
  method: "get",
  operationId: "listTaskInitiativeChanges",
  path: "/task/{taskId}/initiative/history",
  tags,
  summary: "Get a task's initiative change log",
  description: "Every assignment, move and removal, newest first.",
  middleware: initiativeAccess.readOnTask(),
  request: { params: taskIdParam, query: historyQuery },
  responses: {
    200: jsonResponse(
      "Changes of the task's initiative",
      taskInitiativeChangeListSchema,
    ),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Task not found"),
  },
});

const taskInitiativesRouteDef = createRoute({
  method: "post",
  operationId: "getTaskInitiatives",
  path: "/workspace/{workspaceId}/task-initiatives",
  tags,
  summary: "Get the initiative of many tasks",
  description: `The initiative id and name of each requested task, in one read (null for a task without initiative), ordered by task id. A POST only to carry up to 500 ids; it changes nothing. ${READERS} Unknown tasks and tasks of other workspaces are left out the same way.`,
  middleware: initiativeAccess.readOnWorkspace(),
  request: {
    params: workspaceIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: taskInitiativesInput } },
    },
  },
  responses: {
    200: jsonResponse("The tasks' initiatives", taskInitiativesSchema),
    400: errorResponse("Invalid body"),
    401: errorResponse("No session or API key"),
    403: errorResponse("No access to the workspace or missing read permission"),
    404: errorResponse("Workspace not found"),
  },
});

const initiatives = apiRouter()
  .openapi(listRouteDef, async (c) =>
    c.json(
      await listInitiativesWithCounters(
        c.req.valid("param").projectId,
        initiativeReader(c),
      ),
      200,
    ),
  )
  .openapi(optionsRouteDef, async (c) =>
    c.json(await listInitiativeOptions(initiativeReader(c)), 200),
  )
  .openapi(detailRouteDef, async (c) =>
    c.json(
      await getInitiativeDetail(
        c.req.valid("param").initiativeId,
        initiativeReader(c),
      ),
      200,
    ),
  )
  .openapi(planRouteDef, async (c) =>
    c.json(
      await getInitiativePlan(
        c.req.valid("param").initiativeId,
        initiativeReader(c),
        c.req.valid("query").projectIds,
      ),
      200,
    ),
  )
  .openapi(createRouteDef, async (c) => {
    const { actor, ...data } = c.req.valid("json");
    return c.json(
      await createInitiative(
        c.req.valid("param").projectId,
        data,
        initiativeWriter(c, actor),
      ),
      201,
    );
  })
  .openapi(updateRouteDef, async (c) => {
    const { actor, ...data } = c.req.valid("json");
    return c.json(
      await updateInitiative(
        c.req.valid("param").initiativeId,
        data,
        initiativeWriter(c, actor),
      ),
      200,
    );
  })
  .openapi(closePlanRouteDef, async (c) =>
    c.json(
      await closePlan(
        c.req.valid("param").initiativeId,
        initiativeWriter(c, c.req.valid("json").actor),
      ),
      200,
    ),
  )
  .openapi(deleteRouteDef, async (c) =>
    c.json(
      await deleteInitiative(
        c.req.valid("param").initiativeId,
        initiativeWriter(c, c.req.valid("json").actor),
      ),
      200,
    ),
  )
  .openapi(initiativeHistoryRouteDef, async (c) =>
    c.json(
      await listInitiativeChanges(
        c.req.valid("param").initiativeId,
        c.req.valid("query").limit,
      ),
      200,
    ),
  )
  .openapi(putTaskRouteDef, async (c) => {
    const { initiativeId, actor } = c.req.valid("json");
    return c.json(
      await setTaskInitiative(
        c.req.valid("param").taskId,
        initiativeId,
        initiativeWriter(c, actor),
      ),
      200,
    );
  })
  .openapi(getTaskRouteDef, async (c) =>
    c.json(
      await getTaskInitiative(c.req.valid("param").taskId, c.get("userId")),
      200,
    ),
  )
  // The access middleware already answers 404 for an unknown task.
  .openapi(taskHistoryRouteDef, async (c) =>
    c.json(
      await listTaskInitiativeChanges(
        c.req.valid("param").taskId,
        c.req.valid("query").limit,
      ),
      200,
    ),
  )
  .openapi(taskInitiativesRouteDef, async (c) =>
    c.json(
      await getTaskInitiatives(
        c.req.valid("json").taskIds,
        initiativeReader(c),
      ),
      200,
    ),
  );

export default initiatives;
