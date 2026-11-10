import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { projectSchema, toPublicProject } from "../../project/response";
import { projectParam } from "../../project/schema";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { renameProjectBody } from "./schema";
import { renameProject } from "./service";

const renameProjectRoute = createRoute({
  method: "put",
  operationId: "renameProject",
  path: "/project/{id}/name",
  tags: ["Projects"],
  summary: "Rename a project",
  description:
    "Changes only the project's name (Intelia fork); icon, key, description and visibility stay as they are. Needs the same permission as updating the project.",
  middleware: [
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
  ] as const,
  request: {
    params: projectParam,
    body: {
      required: true,
      content: { "application/json": { schema: renameProjectBody } },
    },
  },
  responses: {
    200: jsonResponse("The renamed project, read back", projectSchema),
    400: errorResponse("Empty name or longer than 100 characters"),
    403: errorResponse("No access to the project or missing project:update"),
    404: errorResponse("Project not found"),
  },
});

const projectName = apiRouter<
  BaseVariables & { workspaceId: string }
>().openapi(renameProjectRoute, async (c) => {
  const project = await renameProject(
    c.req.valid("param").id,
    c.get("workspaceId"),
    c.req.valid("json").name,
  );
  return c.json(toPublicProject(project), 200);
});

export default projectName;
