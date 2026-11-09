import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { priorityAccess, priorityReader, priorityWriter } from "./access";
import { PRIORITY_CHANGED_EVENT } from "./event";
import {
  getPriority,
  listPriorityChanges,
  listProjectPriorities,
  listWorkspacePriorities,
} from "./read";
import {
  priorityChangeListSchema,
  priorityWithChainSchema,
  projectPrioritiesSchema,
  workspacePrioritiesSchema,
} from "./response";
import {
  createPriorityInput,
  historyQuery,
  listPrioritiesQuery,
  priorityIdParam,
  projectIdParam,
  updatePriorityInput,
  workspaceIdParam,
} from "./schema";
import { createPriority, updatePriority } from "./service";

const tags = ["Priorities"];

const WRITERS = `Workspace administrators only (workspace:update and workspace:manage_settings, also in an API key's scope). Each real change is one row of the change log and one \`${PRIORITY_CHANGED_EVENT}\` webhook event (README-INTELIA.md, «Prioridades»).`;
const READERS = "Any member of the workspace (workspace:read).";

const readErrors = {
  401: errorResponse("No session or API key"),
  403: errorResponse("Missing read permission"),
};
const writeErrors = {
  401: errorResponse("No session or API key"),
  403: errorResponse("Not an administrator of the workspace"),
};

const listRouteDef = createRoute({
  method: "get",
  operationId: "listWorkspacePriorities",
  path: "/workspace/{workspaceId}/priorities",
  tags,
  summary: "List the workspace's priorities",
  description: `The whole tree, flat and depth first, with their linked projects. ${READERS}`,
  middleware: priorityAccess.readOnWorkspace(),
  request: { params: workspaceIdParam, query: listPrioritiesQuery },
  responses: {
    200: jsonResponse("The workspace's priorities", workspacePrioritiesSchema),
    ...readErrors,
    404: errorResponse("Workspace not found"),
  },
});

const projectRouteDef = createRoute({
  method: "get",
  operationId: "listProjectPriorities",
  path: "/project/{projectId}/priorities",
  tags,
  summary: "List the priorities of a project's board",
  description: `The active priorities linked with the project, each with its chain up to the root. A priority without links never appears here. ${READERS} Needs access to the project.`,
  middleware: priorityAccess.readOnProject(),
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse("The project's priorities", projectPrioritiesSchema),
    ...readErrors,
    404: errorResponse("Project not found"),
  },
});

const getRouteDef = createRoute({
  method: "get",
  operationId: "getPriority",
  path: "/priority/{priorityId}",
  tags,
  summary: "Get a priority",
  description: `The priority with its chain up to the root. ${READERS}`,
  middleware: priorityAccess.readOnPriority(),
  request: { params: priorityIdParam },
  responses: {
    200: jsonResponse("The priority", priorityWithChainSchema),
    ...readErrors,
    404: errorResponse("Priority not found"),
  },
});

const historyRouteDef = createRoute({
  method: "get",
  operationId: "listPriorityChanges",
  path: "/priority/{priorityId}/history",
  tags,
  summary: "Get a priority's change log",
  description: `Its creation and every edit, newest first, with who made it and when. ${READERS}`,
  middleware: priorityAccess.readOnPriority(),
  request: { params: priorityIdParam, query: historyQuery },
  responses: {
    200: jsonResponse("Changes of the priority", priorityChangeListSchema),
    ...readErrors,
    404: errorResponse("Priority not found"),
  },
});

const createRouteDef = createRoute({
  method: "post",
  operationId: "createPriority",
  path: "/workspace/{workspaceId}/priorities",
  tags,
  summary: "Create a priority",
  description: `A root, or a child of another priority of the workspace, linked with zero or more of its projects. ${WRITERS}`,
  middleware: priorityAccess.writeOnWorkspace(),
  request: {
    params: workspaceIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: createPriorityInput } },
    },
  },
  responses: {
    201: jsonResponse("The new priority", priorityWithChainSchema),
    400: errorResponse(
      "Invalid body, a parent of another workspace (PRIORITY_PARENT_NOT_FOUND) or a project that is not of the workspace or not readable (PRIORITY_PROJECT_NOT_FOUND)",
    ),
    ...writeErrors,
    404: errorResponse("Workspace not found"),
  },
});

const updateRouteDef = createRoute({
  method: "patch",
  operationId: "updatePriority",
  path: "/priority/{priorityId}",
  tags,
  summary: "Edit, reorder, move, link or close a priority",
  description: `Changes any of title, text, status (close or reopen), parent, place among its siblings and linked projects, in one change. Fields equal to the current ones change nothing; a request that changes nothing writes no log row and sends no event. ${WRITERS}`,
  middleware: priorityAccess.writeOnPriority(),
  request: {
    params: priorityIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: updatePriorityInput } },
    },
  },
  responses: {
    200: jsonResponse("The priority", priorityWithChainSchema),
    400: errorResponse(
      "Invalid or empty body, a parent of another workspace (PRIORITY_PARENT_NOT_FOUND) or a project that is not of the workspace or not readable (PRIORITY_PROJECT_NOT_FOUND)",
    ),
    ...writeErrors,
    404: errorResponse("Priority not found"),
    409: errorResponse(
      "The new parent is the priority itself or one of its descendants (PRIORITY_CYCLE)",
    ),
  },
});

const priorities = apiRouter()
  .openapi(listRouteDef, async (c) =>
    c.json(
      await listWorkspacePriorities(
        priorityReader(c),
        c.req.valid("query").status,
      ),
      200,
    ),
  )
  .openapi(projectRouteDef, async (c) =>
    c.json(
      await listProjectPriorities(
        c.req.valid("param").projectId,
        priorityReader(c),
      ),
      200,
    ),
  )
  .openapi(getRouteDef, async (c) =>
    c.json(
      await getPriority(c.req.valid("param").priorityId, priorityReader(c)),
      200,
    ),
  )
  .openapi(historyRouteDef, async (c) =>
    c.json(
      await listPriorityChanges(
        c.req.valid("param").priorityId,
        c.req.valid("query").limit,
        priorityReader(c),
      ),
      200,
    ),
  )
  .openapi(createRouteDef, async (c) => {
    const reader = priorityReader(c);
    const id = await createPriority(
      reader.workspaceId,
      c.req.valid("json"),
      priorityWriter(c),
    );
    return c.json(await getPriority(id, reader), 201);
  })
  .openapi(updateRouteDef, async (c) => {
    const reader = priorityReader(c);
    const { priorityId } = c.req.valid("param");
    await updatePriority(
      priorityId,
      reader.workspaceId,
      c.req.valid("json"),
      priorityWriter(c),
    );
    return c.json(await getPriority(priorityId, reader), 200);
  });

export default priorities;
