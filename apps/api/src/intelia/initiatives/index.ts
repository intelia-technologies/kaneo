import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { initiativeAccess, initiativeWriter } from "./access";
import {
  initiativeChangeListSchema,
  initiativeSchema,
  taskInitiativeChangeListSchema,
  taskInitiativeSchema,
} from "./response";
import {
  closePlanInput,
  createInitiativeInput,
  historyQuery,
  initiativeIdParam,
  projectIdParam,
  putTaskInitiativeInput,
  taskIdParam,
  updateInitiativeInput,
} from "./schema";
import {
  closePlan,
  createInitiative,
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
  description: `Changes its name, design link or approval; each real change goes to the change log. ${WRITERS}`,
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
  description: `Puts the task in an initiative of its project. The server sets its origin against that initiative's plan (\`plan\` while open, \`añadido\` once closed) and logs the move. Its current initiative changes nothing. ${WRITERS}`,
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
      "Invalid body, `actor` from a session, an unknown initiative (INITIATIVE_NOT_FOUND) or one of another project (INITIATIVE_NOT_IN_PROJECT)",
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
  description: "The task's initiative and origin, with who set them and when.",
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

const initiatives = apiRouter()
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
    c.json(await getTaskInitiative(c.req.valid("param").taskId), 200),
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
  );

export default initiatives;
