import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

beforeEach(async () => {
  await resetTestDatabase();
});

function getWorkspaceComments(
  workspaceId: string,
  query: Record<string, string | number | undefined>,
  headers?: Record<string, string>,
) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }
  const queryString = searchParams.toString();
  const url = `/api/intelia/workspace/${workspaceId}/comments${queryString ? `?${queryString}` : ""}`;
  return createApp().app.request(url, { headers });
}

describe("GET /api/intelia/workspace/{workspaceId}/comments (DIS-10)", () => {
  it("rejects unauthenticated requests with 401", async () => {
    mockAnonymousSession();
    const { workspace } = await createWorkspaceMember({ role: "owner" });
    const res = await getWorkspaceComments(workspace.id, {
      since: new Date().toISOString(),
    });
    expect(res.status).toBe(401);
  });

  it("rejects non-members and unknown workspaces with 404", async () => {
    const { workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const outsider = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(outsider.user);

    const res = await getWorkspaceComments(workspace.id, {
      since: new Date().toISOString(),
    });
    expect(res.status).toBe(404);

    const missingRes = await getWorkspaceComments("missing-workspace-id", {
      since: new Date().toISOString(),
    });
    expect(missingRes.status).toBe(404);
  });

  it("returns 400 when since is missing or invalid", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    mockAuthenticatedSession(owner);

    // Missing since
    const missingSince = await getWorkspaceComments(workspace.id, {});
    expect(missingSince.status).toBe(400);

    // Invalid since
    const invalidSince = await getWorkspaceComments(workspace.id, {
      since: "not-an-iso-date",
    });
    expect(invalidSince.status).toBe(400);
  });

  it("returns 400 when limit is out of range", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    mockAuthenticatedSession(owner);

    const zeroLimit = await getWorkspaceComments(workspace.id, {
      since: new Date().toISOString(),
      limit: 0,
    });
    expect(zeroLimit.status).toBe(400);

    const overLimit = await getWorkspaceComments(workspace.id, {
      since: new Date().toISOString(),
      limit: 201,
    });
    expect(overLimit.status).toBe(400);
  });

  it("returns comments created at or after since in ascending order by (createdAt, id)", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Alpha",
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({ projectId: project.id, title: "Task 1", status: "to-do" })
      .returning();

    const t0 = new Date("2026-10-30T10:00:00.000Z");
    const t1 = new Date("2026-10-30T10:01:00.000Z");
    const t2 = new Date("2026-10-30T10:02:00.000Z");

    await db.insert(schema.activityTable).values([
      {
        id: "comment_0",
        taskId: task.id,
        type: "comment",
        content: "Older comment",
        createdAt: t0,
      },
      {
        id: "comment_1",
        taskId: task.id,
        type: "comment",
        content: "First target comment",
        createdAt: t1,
        userId: owner.id,
      },
      {
        id: "comment_2",
        taskId: task.id,
        type: "comment",
        content: "Second target comment",
        createdAt: t2,
        externalUserName: "bot-agent",
      },
    ]);

    mockAuthenticatedSession(owner);

    // Query since t1 (inclusive)
    const res = await getWorkspaceComments(workspace.id, {
      since: t1.toISOString(),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.hasMore).toBe(false);
    expect(data.comments).toHaveLength(2);

    expect(data.comments[0]).toMatchObject({
      id: "comment_1",
      taskId: task.id,
      taskTitle: "Task 1",
      taskStatus: "to-do",
      projectId: project.id,
      userId: owner.id,
      userName: owner.name,
      externalUserName: null,
      content: "First target comment",
      createdAt: t1.toISOString(),
    });

    expect(data.comments[1]).toMatchObject({
      id: "comment_2",
      taskId: task.id,
      taskTitle: "Task 1",
      taskStatus: "to-do",
      projectId: project.id,
      userId: null,
      userName: null,
      externalUserName: "bot-agent",
      content: "Second target comment",
      createdAt: t2.toISOString(),
    });
  });

  it("paginates with limit and hasMore", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({ projectId: project.id, title: "Task Paging" })
      .returning();

    const baseTime = new Date("2026-10-30T10:00:00.000Z");
    await db.insert(schema.activityTable).values([
      {
        id: "c_1",
        taskId: task.id,
        type: "comment",
        content: "Comment 1",
        createdAt: new Date(baseTime.getTime() + 1000),
      },
      {
        id: "c_2",
        taskId: task.id,
        type: "comment",
        content: "Comment 2",
        createdAt: new Date(baseTime.getTime() + 2000),
      },
      {
        id: "c_3",
        taskId: task.id,
        type: "comment",
        content: "Comment 3",
        createdAt: new Date(baseTime.getTime() + 3000),
      },
    ]);

    mockAuthenticatedSession(owner);

    // Page 1: limit 2 -> hasMore = true
    const page1Res = await getWorkspaceComments(workspace.id, {
      since: baseTime.toISOString(),
      limit: 2,
    });
    expect(page1Res.status).toBe(200);
    const page1Data = await page1Res.json();
    expect(page1Data.comments.map((c: { id: string }) => c.id)).toEqual([
      "c_1",
      "c_2",
    ]);
    expect(page1Data.hasMore).toBe(true);

    // Page 2: since c_2 -> limit 2 -> hasMore = false
    const page2Res = await getWorkspaceComments(workspace.id, {
      since: page1Data.comments[1].createdAt,
      afterId: page1Data.comments[1].id,
      limit: 2,
    });
    expect(page2Res.status).toBe(200);
    const page2Data = await page2Res.json();
    expect(page2Data.comments.map((c: { id: string }) => c.id)).toEqual([
      "c_3",
    ]);
    expect(page2Data.hasMore).toBe(false);
  });

  it("handles identical millisecond createdAt with stable compound cursor pagination (since + afterId)", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({ projectId: project.id, title: "Task Microseconds" })
      .returning();

    // Two comments created at the exact same millisecond with distinct microsecond fractions in Postgres
    await db.execute(sql`
      INSERT INTO activity (id, task_id, type, content, created_at)
      VALUES 
        ('act_same_1', ${task.id}, 'comment', 'Comment A', timestamp '2026-10-30 11:22:33.456111'),
        ('act_same_2', ${task.id}, 'comment', 'Comment B', timestamp '2026-10-30 11:22:33.456888')
    `);

    mockAuthenticatedSession(owner);

    const sinceParam = "2026-10-30T11:22:33.456Z";

    // Step 1: fetch with limit = 1 (should return first comment and hasMore = true)
    const step1Res = await getWorkspaceComments(workspace.id, {
      since: sinceParam,
      limit: 1,
    });
    expect(step1Res.status).toBe(200);
    const step1 = await step1Res.json();
    expect(step1.comments).toHaveLength(1);
    expect(step1.comments[0].id).toBe("act_same_1");
    expect(step1.comments[0].createdAt).toBe(sinceParam);
    expect(step1.hasMore).toBe(true);

    // Step 2: fetch next page with cursor (since=createdAt, afterId=id) and limit = 1
    const step2Res = await getWorkspaceComments(workspace.id, {
      since: step1.comments[0].createdAt,
      afterId: step1.comments[0].id,
      limit: 1,
    });
    expect(step2Res.status).toBe(200);
    const step2 = await step2Res.json();
    expect(step2.comments).toHaveLength(1);
    expect(step2.comments[0].id).toBe("act_same_2");
    expect(step2.comments[0].createdAt).toBe(sinceParam);
    expect(step2.hasMore).toBe(false);

    // Step 3: next page from act_same_2 is empty
    const step3Res = await getWorkspaceComments(workspace.id, {
      since: step2.comments[0].createdAt,
      afterId: step2.comments[0].id,
      limit: 1,
    });
    expect(step3Res.status).toBe(200);
    const step3 = await step3Res.json();
    expect(step3.comments).toHaveLength(0);
    expect(step3.hasMore).toBe(false);
  });

  it("excludes comments from archived projects", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const { project: activeProject } = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Active Project",
    });
    const { project: archivedProject } = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Archived Project",
    });

    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projectTable.id, archivedProject.id));

    const [activeTask] = await db
      .insert(schema.taskTable)
      .values({ projectId: activeProject.id, title: "Active task" })
      .returning();

    const [archivedTask] = await db
      .insert(schema.taskTable)
      .values({ projectId: archivedProject.id, title: "Archived task" })
      .returning();

    const now = new Date("2026-10-30T10:00:00.000Z");
    await db.insert(schema.activityTable).values([
      {
        id: "act_active",
        taskId: activeTask.id,
        type: "comment",
        content: "Visible comment",
        createdAt: now,
      },
      {
        id: "act_archived",
        taskId: archivedTask.id,
        type: "comment",
        content: "Hidden comment from archived project",
        createdAt: now,
      },
    ]);

    mockAuthenticatedSession(owner);

    const res = await getWorkspaceComments(workspace.id, {
      since: now.toISOString(),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0].id).toBe("act_active");
  });

  it("excludes comments from projects the caller cannot access", async () => {
    const { workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const { project: alpha } = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Alpha Project",
    });
    const { project: beta } = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Beta Project",
    });

    const [alphaTask] = await db
      .insert(schema.taskTable)
      .values({ projectId: alpha.id, title: "Alpha task" })
      .returning();
    const [betaTask] = await db
      .insert(schema.taskTable)
      .values({ projectId: beta.id, title: "Beta task" })
      .returning();

    const now = new Date("2026-10-30T10:00:00.000Z");
    await db.insert(schema.activityTable).values([
      {
        id: "comment_alpha",
        taskId: alphaTask.id,
        type: "comment",
        content: "Alpha comment",
        createdAt: now,
      },
      {
        id: "comment_beta",
        taskId: betaTask.id,
        type: "comment",
        content: "Beta comment",
        createdAt: now,
      },
    ]);

    // Restricted member has access only to Alpha
    const member = await addWorkspaceMember(workspace.id);
    await restrictToProjects(workspace.id, member.id, [alpha.id]);
    mockAuthenticatedSession(member);

    const res = await getWorkspaceComments(workspace.id, {
      since: now.toISOString(),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0].id).toBe("comment_alpha");
    expect(data.comments[0].projectId).toBe(alpha.id);
  });

  it("excludes non-comment activities and null content", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({ projectId: project.id, title: "Task with mixed activities" })
      .returning();

    const now = new Date("2026-10-30T10:00:00.000Z");
    await db.insert(schema.activityTable).values([
      {
        id: "act_comment",
        taskId: task.id,
        type: "comment",
        content: "Real comment",
        createdAt: now,
      },
      {
        id: "act_status",
        taskId: task.id,
        type: "status_changed",
        content: "Changed status",
        createdAt: now,
      },
      {
        id: "act_created",
        taskId: task.id,
        type: "created",
        content: null,
        createdAt: now,
      },
      {
        id: "act_null_comment",
        taskId: task.id,
        type: "comment",
        content: null,
        createdAt: now,
      },
    ]);

    mockAuthenticatedSession(owner);

    const res = await getWorkspaceComments(workspace.id, {
      since: now.toISOString(),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0].id).toBe("act_comment");
  });
});
