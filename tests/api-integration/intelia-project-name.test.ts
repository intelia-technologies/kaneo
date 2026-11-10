// Renaming a project (KF-13): only `name` changes, unlike upstream's PUT
// /api/project/{id}, which replaces every field and rejects a null description.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

type App = ReturnType<typeof createApp>["app"];

beforeEach(async () => {
  await resetTestDatabase();
  vi.restoreAllMocks();
});

async function setup() {
  const { user, workspace } = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Old name",
    icon: "Rocket",
    slug: "SF",
  });
  await db
    .update(schema.projectTable)
    .set({ isPublic: true })
    .where(eq(schema.projectTable.id, project.id));
  mockAuthenticatedSession(user);
  return { app: createApp().app, workspace, project };
}

function rename(app: App, id: string, body: unknown) {
  return app.request(`/api/intelia/project/${id}/name`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function stored(id: string) {
  const [project] = await db
    .select()
    .from(schema.projectTable)
    .where(eq(schema.projectTable.id, id));
  return project;
}

describe("PUT /api/intelia/project/{id}/name", () => {
  it("changes only the name and returns the project read back", async () => {
    const { app, project } = await setup();
    const before = await stored(project.id);
    expect(before?.description).toBeNull();

    const response = await rename(app, project.id, { name: "  New name  " });

    expect(response.status, await response.clone().text()).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: project.id,
      name: "New name",
      description: null,
      icon: "Rocket",
      slug: "SF",
      isPublic: true,
    });
    expect(await stored(project.id)).toEqual({ ...before, name: "New name" });
  });

  it("accepts a name of exactly 100 characters", async () => {
    const { app, project } = await setup();
    const name = "n".repeat(100);

    const response = await rename(app, project.id, { name });

    expect(response.status).toBe(200);
    expect((await stored(project.id))?.name).toBe(name);
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a blank name", { name: "   " }],
    ["a name over 100 characters", { name: "n".repeat(101) }],
    ["no name", {}],
    ["a name that is not a string", { name: 7 }],
  ])("rejects %s with 400 and changes nothing", async (_, body) => {
    const { app, project } = await setup();
    const before = await stored(project.id);

    expect((await rename(app, project.id, body)).status).toBe(400);
    expect(await stored(project.id)).toEqual(before);
  });

  it("answers 404 for an unknown project", async () => {
    const { app } = await setup();

    expect((await rename(app, "no-such-project", { name: "X" })).status).toBe(
      404,
    );
  });

  it("requires project:update and access to the project", async () => {
    const { project, workspace } = await setup();
    const before = await stored(project.id);

    const member = await addWorkspaceMember(workspace.id, "member");
    vi.restoreAllMocks();
    mockAuthenticatedSession(member);
    expect(
      (await rename(createApp().app, project.id, { name: "X" })).status,
    ).toBe(403);

    const admin = await addWorkspaceMember(workspace.id, "admin");
    const other = await createProjectFixture({ workspaceId: workspace.id });
    await restrictToProjects(workspace.id, admin.id, [other.project.id]);
    vi.restoreAllMocks();
    mockAuthenticatedSession(admin);
    expect(
      (await rename(createApp().app, project.id, { name: "X" })).status,
    ).toBe(403);

    // Outside the workspace the project does not exist for the caller, as in
    // upstream's PUT /api/project/{id}: same answer, 404.
    const stranger = await createWorkspaceMember({ role: "owner" });
    vi.restoreAllMocks();
    mockAuthenticatedSession(stranger.user);
    const app = createApp().app;
    const upstream = await app.request(`/api/project/${project.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "X",
        icon: "Rocket",
        slug: "SF",
        description: "",
        isPublic: true,
      }),
    });
    const renamed = await rename(app, project.id, { name: "X" });
    expect(renamed.status).toBe(upstream.status);
    expect(renamed.status).toBe(404);

    expect(await stored(project.id)).toEqual(before);
  });
});
