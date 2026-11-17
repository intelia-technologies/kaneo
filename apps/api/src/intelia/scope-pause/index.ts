import { gte, isNull, or, type SQL } from "drizzle-orm";
import type { Context } from "hono";
import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../../openapi";
import { initiativeAccess, initiativeWriter } from "../initiatives/access";
import {
  initiativeIdParam,
  projectIdParam,
  workspaceIdParam,
} from "../initiatives/schema";
import { scopePauseTable } from "../schema";
import { pauseAccess } from "./access";
import { type PauseReader, readPauses } from "./read";
import type { ScopePause } from "./response";
import {
  pauseAlreadyActiveSchema,
  scopePauseChangeListSchema,
  scopePauseListSchema,
  scopePauseSchema,
} from "./response";
import {
  createPauseInput,
  listPausesQuery,
  pauseIdParam,
  resumePauseInput,
  updatePauseInput,
} from "./schema";
import {
  createPause,
  listPauseChanges,
  resumePause,
  updatePause,
} from "./service";

const tags = ["Scope pauses"];

const WRITERS =
  "A person's session or an account's API key, with task:update on the home project (the project, or the initiative's). Who may pause is checked by the factory's gateway against the graph before calling (design 81 §4.3). With an API key, `actor` names who the caller acts for (informative, logged as given).";

const writeErrors = {
  401: errorResponse("No session or API key"),
  403: errorResponse("No access to the project or missing task:update"),
};

const createErrors = {
  400: errorResponse(
    "PAUSA_MOTIVO_REQUERIDO, PAUSA_REVISAR_EL_REQUERIDA, PAUSA_REVISAR_EL_PASADA, or `actor` from a session",
  ),
  ...writeErrors,
  409: jsonResponse(
    "The scope already has an active pause (PAUSA_YA_ACTIVA): nothing changed, and the body carries that pause",
    pauseAlreadyActiveSchema,
  ),
};

const CREATE_DESCRIPTION = `Pauses the scope: the dispatcher stops moving and launching its tasks, and their routines skip their ticks, until someone resumes it. At most one active pause per scope, also with concurrent requests. ${WRITERS}`;

const pauseProjectRouteDef = createRoute({
  method: "post",
  operationId: "pauseProject",
  path: "/project/{projectId}/pause",
  tags,
  summary: "Pause a project",
  description: CREATE_DESCRIPTION,
  middleware: initiativeAccess.writeOnProject(),
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: createPauseInput } },
    },
  },
  responses: {
    201: jsonResponse("The new pause", scopePauseSchema),
    ...createErrors,
    404: errorResponse("Project not found"),
  },
});

const pauseInitiativeRouteDef = createRoute({
  method: "post",
  operationId: "pauseInitiative",
  path: "/initiative/{initiativeId}/pause",
  tags,
  summary: "Pause an initiative",
  description: `${CREATE_DESCRIPTION} It covers the initiative's tasks in every project.`,
  middleware: initiativeAccess.writeOnInitiative(),
  request: {
    params: initiativeIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: createPauseInput } },
    },
  },
  responses: {
    201: jsonResponse("The new pause", scopePauseSchema),
    ...createErrors,
    404: errorResponse("Initiative not found"),
  },
});

const updateRouteDef = createRoute({
  method: "patch",
  operationId: "updateScopePause",
  path: "/scope-pause/{pauseId}",
  tags,
  summary: "Change an active pause",
  description: `Changes its reason or review date; each real change goes to the history. ${WRITERS}`,
  middleware: pauseAccess.writeOnPause(),
  request: {
    params: pauseIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: updatePauseInput } },
    },
  },
  responses: {
    200: jsonResponse("The pause", scopePauseSchema),
    400: errorResponse(
      "Nothing to change, PAUSA_MOTIVO_REQUERIDO, PAUSA_REVISAR_EL_REQUERIDA, PAUSA_REVISAR_EL_PASADA, or `actor` from a session",
    ),
    ...writeErrors,
    404: errorResponse("Pause not found"),
    409: errorResponse("The pause was already resumed (PAUSA_REANUDADA)"),
  },
});

const resumeRouteDef = createRoute({
  method: "post",
  operationId: "resumeScopePause",
  path: "/scope-pause/{pauseId}/resume",
  tags,
  summary: "Resume a pause",
  description: `Lifts the pause. Idempotent: resuming a resumed pause changes nothing and returns it as it is. ${WRITERS} The body is optional.`,
  middleware: pauseAccess.writeOnPause(),
  request: {
    params: pauseIdParam,
    body: {
      required: false,
      content: { "application/json": { schema: resumePauseInput } },
    },
  },
  responses: {
    200: jsonResponse("The resumed pause", scopePauseSchema),
    400: errorResponse("Invalid body, or `actor` from a session"),
    ...writeErrors,
    404: errorResponse("Pause not found"),
  },
});

const listRouteDef = createRoute({
  method: "get",
  operationId: "listScopePauses",
  path: "/workspace/{workspaceId}/scope-pauses",
  tags,
  summary: "List a workspace's scope pauses",
  description:
    "The pauses of the projects and initiatives the caller can read, oldest first. Each initiative pause lists its tasks of every readable project, read now, so a task added to the initiative after pausing it is included. Needs task:read.",
  middleware: initiativeAccess.readOnWorkspace(),
  request: { params: workspaceIdParam, query: listPausesQuery },
  responses: {
    200: jsonResponse("The pauses", scopePauseListSchema),
    400: errorResponse("Invalid query"),
    401: errorResponse("No session or API key"),
    403: errorResponse("No access to the workspace or missing read permission"),
    404: errorResponse("Workspace not found"),
  },
});

const historyRouteDef = createRoute({
  method: "get",
  operationId: "listScopePauseChanges",
  path: "/scope-pause/{pauseId}/history",
  tags,
  summary: "Get a pause's history",
  description:
    "Its creation, changes and resumption, oldest first, each with who made it. Needs task:read and access to the home project.",
  middleware: pauseAccess.readOnPause(),
  request: { params: pauseIdParam },
  responses: {
    200: jsonResponse("The pause's changes", scopePauseChangeListSchema),
    403: errorResponse("No access to the project or missing read permission"),
    404: errorResponse("Pause not found"),
  },
});

function pauseReader(c: Context): PauseReader {
  return { userId: c.get("userId"), workspaceId: c.get("workspaceId") };
}

function listFilter(query: z.infer<typeof listPausesQuery>): SQL | undefined {
  const active = isNull(scopePauseTable.resumedAt);
  if (query.estado === "activa") return active;
  if (!query.desde) return undefined;
  return or(active, gte(scopePauseTable.resumedAt, new Date(query.desde)));
}

function alreadyActive(pause: ScopePause) {
  return {
    message: "The scope already has an active pause",
    code: "PAUSA_YA_ACTIVA" as const,
    pause,
  };
}

const scopePause = apiRouter()
  .openapi(pauseProjectRouteDef, async (c) => {
    const { actor, ...input } = c.req.valid("json");
    const result = await createPause(
      { type: "project", projectId: c.req.valid("param").projectId },
      input,
      initiativeWriter(c, actor),
      pauseReader(c),
    );
    return result.created
      ? c.json(result.pause, 201)
      : c.json(alreadyActive(result.pause), 409);
  })
  .openapi(pauseInitiativeRouteDef, async (c) => {
    const { actor, ...input } = c.req.valid("json");
    const result = await createPause(
      { type: "initiative", initiativeId: c.req.valid("param").initiativeId },
      input,
      initiativeWriter(c, actor),
      pauseReader(c),
    );
    return result.created
      ? c.json(result.pause, 201)
      : c.json(alreadyActive(result.pause), 409);
  })
  .openapi(updateRouteDef, async (c) => {
    const { actor, ...input } = c.req.valid("json");
    return c.json(
      await updatePause(
        c.req.valid("param").pauseId,
        input,
        initiativeWriter(c, actor),
        pauseReader(c),
      ),
      200,
    );
  })
  .openapi(resumeRouteDef, async (c) => {
    const { actor, nota } = c.req.valid("json");
    return c.json(
      await resumePause(
        c.req.valid("param").pauseId,
        { nota },
        initiativeWriter(c, actor),
        pauseReader(c),
      ),
      200,
    );
  })
  .openapi(listRouteDef, async (c) =>
    c.json(
      {
        pausas: await readPauses(
          pauseReader(c),
          listFilter(c.req.valid("query")),
        ),
        calculadoEn: new Date(),
      },
      200,
    ),
  )
  .openapi(historyRouteDef, async (c) =>
    c.json(await listPauseChanges(c.req.valid("param").pauseId), 200),
  );

export default scopePause;
