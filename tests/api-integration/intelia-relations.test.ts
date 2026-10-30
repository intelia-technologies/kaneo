import { beforeEach, describe, expect, it } from "vite-plus/test";
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

type Relation = { id: string; sourceTaskId: string; targetTaskId: string };

beforeEach(async () => {
  await resetTestDatabase();
});

function getRelations(projectId: string) {
  return createApp().app.request(`/api/intelia/project/${projectId}/relations`);
}

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

// Alpha has an internal chain, a blocker in Beta (done) and a related task in
// Beta; Beta also has a relation of its own that Alpha must not return.
async function seed() {
  const { user: owner, workspace } = await createWorkspaceMember({
    role: "owner",
  });
  const alpha = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Alpha",
    slug: "alpha",
  });
  const beta = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Beta",
    slug: "beta",
  });
  const [alphaOne, alphaTwo, betaDone, betaOpen] = await db
    .insert(schema.taskTable)
    .values([
      { projectId: alpha.project.id, title: "Alpha one", number: 1 },
      { projectId: alpha.project.id, title: "Alpha two", number: 2 },
      {
        projectId: beta.project.id,
        title: "Beta prerequisite",
        number: 7,
        status: beta.columns.done.slug,
        columnId: beta.columns.done.id,
      },
      {
        projectId: beta.project.id,
        title: "Beta open",
        number: 8,
        status: beta.columns.inProgress.slug,
        columnId: beta.columns.inProgress.id,
      },
    ])
    .returning();
  const relations = await db
    .insert(schema.taskRelationTable)
    .values([
      {
        sourceTaskId: alphaOne.id,
        targetTaskId: alphaTwo.id,
        relationType: "blocks",
      },
      {
        sourceTaskId: betaDone.id,
        targetTaskId: alphaOne.id,
        relationType: "blocks",
      },
      {
        sourceTaskId: alphaTwo.id,
        targetTaskId: betaOpen.id,
        relationType: "related",
      },
      {
        sourceTaskId: betaDone.id,
        targetTaskId: betaOpen.id,
        relationType: "blocks",
      },
    ])
    .returning();
  return {
    owner,
    workspace,
    alpha: alpha.project,
    beta: beta.project,
    betaDone,
    betaOpen,
    relations,
  };
}

describe("GET /api/intelia/project/{projectId}/relations", () => {
  it("returns every relation touching the project and its external endpoints", async () => {
    const { owner, alpha, beta, betaDone, betaOpen, relations } = await seed();
    mockAuthenticatedSession(owner);

    const response = await getRelations(alpha.id);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      relations: Relation[];
      externalTasks: { id: string }[];
    };
    expect(body.relations.sort(byId)).toEqual(
      relations
        .slice(0, 3)
        .map(({ id, sourceTaskId, targetTaskId, relationType }) => ({
          id,
          sourceTaskId,
          targetTaskId,
          relationType,
        }))
        .sort(byId),
    );
    expect(body.externalTasks.sort(byId)).toEqual(
      [
        {
          id: betaDone.id,
          number: 7,
          title: "Beta prerequisite",
          status: "done",
          isCompleted: true,
          projectId: beta.id,
          projectSlug: "beta",
          projectName: "Beta",
        },
        {
          id: betaOpen.id,
          number: 8,
          title: "Beta open",
          status: "in-progress",
          isCompleted: false,
          projectId: beta.id,
          projectSlug: "beta",
          projectName: "Beta",
        },
      ].sort(byId),
    );
  });

  it("omits relations to projects the caller cannot see", async () => {
    const { workspace, alpha, relations } = await seed();
    const member = await addWorkspaceMember(workspace.id);
    await restrictToProjects(workspace.id, member.id, [alpha.id]);
    mockAuthenticatedSession(member);

    const response = await getRelations(alpha.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      relations: [
        {
          id: relations[0].id,
          sourceTaskId: relations[0].sourceTaskId,
          targetTaskId: relations[0].targetTaskId,
          relationType: "blocks",
        },
      ],
      externalTasks: [],
    });
  });

  it("rejects a member without access to the project", async () => {
    const { workspace, alpha, beta } = await seed();
    const member = await addWorkspaceMember(workspace.id);
    await restrictToProjects(workspace.id, member.id, [alpha.id]);
    mockAuthenticatedSession(member);

    expect((await getRelations(beta.id)).status).toBe(403);
  });

  it("hides the project from users outside its workspace", async () => {
    const { alpha } = await seed();
    const outsider = await createWorkspaceMember();
    mockAuthenticatedSession(outsider.user);

    expect((await getRelations(alpha.id)).status).toBe(404);
    expect((await getRelations("missing-project")).status).toBe(404);
  });
});
