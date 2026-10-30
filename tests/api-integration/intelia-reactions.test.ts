import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { commentReactionTable } from "../../apps/api/src/intelia/schema";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

beforeEach(resetTestDatabase);

async function setupFixture() {
  const adminMember = await createWorkspaceMember({
    role: "admin",
    userName: "Admin User",
  });
  const regularMember = await createWorkspaceMember({
    role: "member",
    userName: "Regular Member",
  });

  // Put regularMember in the same workspace as a member without manage_settings
  await db.insert(schema.workspaceUserTable).values({
    workspaceId: adminMember.workspace.id,
    userId: regularMember.user.id,
    role: "member",
    joinedAt: new Date(),
  });

  const { project, columns } = await createProjectFixture({
    workspaceId: adminMember.workspace.id,
  });

  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId: project.id,
      title: "Task with reactions",
      status: "to-do",
      columnId: columns.todo.id,
      priority: "medium",
      number: 1,
      position: 1,
    })
    .returning();

  const [comment] = await db
    .insert(schema.activityTable)
    .values({
      taskId: task.id,
      userId: adminMember.user.id,
      type: "comment",
      content: "A comment to react to",
    })
    .returning();

  const outsider = await createWorkspaceMember({
    role: "owner",
    userName: "Outsider",
  });

  return {
    adminMember,
    regularMember,
    outsider,
    project,
    columns,
    task,
    comment,
  };
}

describe("API integration: Intelia reactions", () => {
  it("adds a human reaction and an external-actor reaction on the same comment, listed with names", async () => {
    const { adminMember, regularMember, task, comment } = await setupFixture();
    const { app } = createApp();

    // 1. Regular member reacts as themself with 👍
    mockAuthenticatedSession(regularMember.user);
    const humanRes = await app.request(
      `/api/intelia/comment/${comment.id}/reactions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emoji: "👍" }),
      },
    );
    expect(humanRes.status).toBe(200);
    const humanReaction = (await humanRes.json()) as {
      id: string;
      taskId: string;
      commentId: string | null;
      emoji: string;
      userId: string;
      userName: string | null;
      externalUserName: string | null;
      createdAt: string;
    };
    expect(humanReaction.emoji).toBe("👍");
    expect(humanReaction.userId).toBe(regularMember.user.id);
    expect(humanReaction.userName).toBe("Regular Member");
    expect(humanReaction.externalUserName).toBeNull();
    expect(humanReaction.taskId).toBe(task.id);
    expect(humanReaction.commentId).toBe(comment.id);
    expect(typeof humanReaction.createdAt).toBe("string");

    // 2. Admin reacts with external actor "Coder Ibarra" and 🚀
    mockAuthenticatedSession(adminMember.user);
    const externalRes = await app.request(
      `/api/intelia/comment/${comment.id}/reactions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          emoji: "🚀",
          externalUserName: "Coder Ibarra",
        }),
      },
    );
    expect(externalRes.status).toBe(200);
    const externalReaction = (await externalRes.json()) as {
      id: string;
      taskId: string;
      commentId: string | null;
      emoji: string;
      userId: string;
      userName: string | null;
      externalUserName: string | null;
      createdAt: string;
    };
    expect(externalReaction.emoji).toBe("🚀");
    expect(externalReaction.userId).toBe(adminMember.user.id);
    expect(externalReaction.userName).toBe("Admin User");
    expect(externalReaction.externalUserName).toBe("Coder Ibarra");
    expect(externalReaction.taskId).toBe(task.id);
    expect(externalReaction.commentId).toBe(comment.id);

    // 3. List reactions for the comment (oldest first)
    const listRes = await app.request(
      `/api/intelia/comment/${comment.id}/reactions`,
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as Array<{
      id: string;
      emoji: string;
      userName: string | null;
      externalUserName: string | null;
    }>;
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      id: humanReaction.id,
      emoji: "👍",
      userName: "Regular Member",
      externalUserName: null,
    });
    expect(list[1]).toMatchObject({
      id: externalReaction.id,
      emoji: "🚀",
      userName: "Admin User",
      externalUserName: "Coder Ibarra",
    });
  });

  it("handles duplicate POST idempotently without duplicating reactions", async () => {
    const { regularMember, comment } = await setupFixture();
    mockAuthenticatedSession(regularMember.user);
    const { app } = createApp();

    const first = await app.request(
      `/api/intelia/comment/${comment.id}/reactions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emoji: "👍" }),
      },
    );
    expect(first.status).toBe(200);
    const firstJson = (await first.json()) as { id: string };

    const second = await app.request(
      `/api/intelia/comment/${comment.id}/reactions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emoji: "👍" }),
      },
    );
    expect(second.status).toBe(200);
    const secondJson = (await second.json()) as { id: string };

    expect(secondJson.id).toBe(firstJson.id);

    const rows = await db
      .select()
      .from(commentReactionTable)
      .where(eq(commentReactionTable.commentId, comment.id));
    expect(rows).toHaveLength(1);
  });

  it("removes one reaction while leaving the other intact", async () => {
    const { adminMember, regularMember, comment } = await setupFixture();
    const { app } = createApp();

    // Human reaction 👍
    mockAuthenticatedSession(regularMember.user);
    await app.request(`/api/intelia/comment/${comment.id}/reactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emoji: "👍" }),
    });

    // External reaction 🚀 by admin
    mockAuthenticatedSession(adminMember.user);
    await app.request(`/api/intelia/comment/${comment.id}/reactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emoji: "🚀", externalUserName: "Coder Ibarra" }),
    });

    // Regular member removes their 👍
    mockAuthenticatedSession(regularMember.user);
    const removeRes = await app.request(
      `/api/intelia/comment/${comment.id}/reactions?emoji=${encodeURIComponent("👍")}`,
      { method: "DELETE" },
    );
    expect(removeRes.status).toBe(200);
    const removed = (await removeRes.json()) as { emoji: string };
    expect(removed.emoji).toBe("👍");

    // Comment reactions now only contains the external one
    const listRes = await app.request(
      `/api/intelia/comment/${comment.id}/reactions`,
    );
    expect(listRes.status).toBe(200);
    const remaining = (await listRes.json()) as Array<{
      emoji: string;
      externalUserName: string | null;
    }>;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      emoji: "🚀",
      externalUserName: "Coder Ibarra",
    });
  });

  it("returns 403 when a member without manage_settings sends externalUserName", async () => {
    const { regularMember, task, comment } = await setupFixture();
    mockAuthenticatedSession(regularMember.user);
    const { app } = createApp();

    // POST comment reaction
    const commentPost = await app.request(
      `/api/intelia/comment/${comment.id}/reactions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          emoji: "🎉",
          externalUserName: "Unauthorized Agent",
        }),
      },
    );
    expect(commentPost.status).toBe(403);

    // POST task card reaction
    const taskPost = await app.request(
      `/api/intelia/task/${task.id}/reactions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          emoji: "🎉",
          externalUserName: "Unauthorized Agent",
        }),
      },
    );
    expect(taskPost.status).toBe(403);

    // DELETE comment reaction
    const commentDelete = await app.request(
      `/api/intelia/comment/${comment.id}/reactions?emoji=${encodeURIComponent("🎉")}&externalUserName=${encodeURIComponent("Unauthorized Agent")}`,
      { method: "DELETE" },
    );
    expect(commentDelete.status).toBe(403);

    // DELETE task card reaction
    const taskDelete = await app.request(
      `/api/intelia/task/${task.id}/reactions?emoji=${encodeURIComponent("🎉")}&externalUserName=${encodeURIComponent("Unauthorized Agent")}`,
      { method: "DELETE" },
    );
    expect(taskDelete.status).toBe(403);
  });

  it("returns 404 when caller tries to remove someone else's reaction", async () => {
    const { adminMember, regularMember, comment } = await setupFixture();
    const { app } = createApp();

    // Regular member reacts with 👍
    mockAuthenticatedSession(regularMember.user);
    await app.request(`/api/intelia/comment/${comment.id}/reactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emoji: "👍" }),
    });

    // Admin tries to remove regular member's reaction
    mockAuthenticatedSession(adminMember.user);
    const deleteRes = await app.request(
      `/api/intelia/comment/${comment.id}/reactions?emoji=${encodeURIComponent("👍")}`,
      { method: "DELETE" },
    );
    expect(deleteRes.status).toBe(404);

    // Regular member's reaction is still there
    const listRes = await app.request(
      `/api/intelia/comment/${comment.id}/reactions`,
    );
    const list = (await listRes.json()) as Array<{ emoji: string }>;
    expect(list).toHaveLength(1);
    expect(list[0]?.emoji).toBe("👍");
  });

  it("supports card reactions and task list returns both card and comment reactions", async () => {
    const { regularMember, adminMember, task, comment } = await setupFixture();
    const { app } = createApp();

    // Regular member reacts to card
    mockAuthenticatedSession(regularMember.user);
    const cardRes = await app.request(
      `/api/intelia/task/${task.id}/reactions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emoji: "👀" }),
      },
    );
    expect(cardRes.status).toBe(200);
    const cardReaction = (await cardRes.json()) as {
      commentId: string | null;
      emoji: string;
      taskId: string;
    };
    expect(cardReaction.commentId).toBeNull();
    expect(cardReaction.emoji).toBe("👀");
    expect(cardReaction.taskId).toBe(task.id);

    // Admin reacts to comment
    mockAuthenticatedSession(adminMember.user);
    await app.request(`/api/intelia/comment/${comment.id}/reactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emoji: "🎉" }),
    });

    // GET task reactions returns both
    const taskListRes = await app.request(
      `/api/intelia/task/${task.id}/reactions`,
    );
    expect(taskListRes.status).toBe(200);
    const allReactions = (await taskListRes.json()) as Array<{
      commentId: string | null;
      emoji: string;
    }>;
    expect(allReactions).toHaveLength(2);
    expect(allReactions[0]).toMatchObject({
      commentId: null,
      emoji: "👀",
    });
    expect(allReactions[1]).toMatchObject({
      commentId: comment.id,
      emoji: "🎉",
    });

    // Removing card reaction works
    mockAuthenticatedSession(regularMember.user);
    const removeCardRes = await app.request(
      `/api/intelia/task/${task.id}/reactions?emoji=${encodeURIComponent("👀")}`,
      { method: "DELETE" },
    );
    expect(removeCardRes.status).toBe(200);

    const afterRemoveRes = await app.request(
      `/api/intelia/task/${task.id}/reactions`,
    );
    const afterList = (await afterRemoveRes.json()) as Array<{
      commentId: string | null;
    }>;
    expect(afterList).toHaveLength(1);
    expect(afterList[0]?.commentId).toBe(comment.id);
  });

  it("cascades deletion of reactions when the comment is deleted", async () => {
    const { adminMember, regularMember, task, comment } = await setupFixture();
    mockAuthenticatedSession(regularMember.user);
    const { app } = createApp();

    // React on comment and react on card
    await app.request(`/api/intelia/comment/${comment.id}/reactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emoji: "❤️" }),
    });
    await app.request(`/api/intelia/task/${task.id}/reactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emoji: "🚀" }),
    });

    // Verify reaction in DB
    const commentReactionsBefore = await db
      .select()
      .from(commentReactionTable)
      .where(eq(commentReactionTable.commentId, comment.id));
    expect(commentReactionsBefore).toHaveLength(1);

    // Author of comment is adminMember; deleting comment cascades reactions
    mockAuthenticatedSession(adminMember.user);
    const delRes = await app.request(`/api/comment/${comment.id}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);

    // Comment reactions are cascaded away
    const commentReactionsAfter = await db
      .select()
      .from(commentReactionTable)
      .where(eq(commentReactionTable.commentId, comment.id));
    expect(commentReactionsAfter).toHaveLength(0);

    // Card reaction remains
    const taskReactions = await db
      .select()
      .from(commentReactionTable)
      .where(eq(commentReactionTable.taskId, task.id));
    expect(taskReactions).toHaveLength(1);
    expect(taskReactions[0]?.commentId).toBeNull();
  });

  it("accepts exactly one emoji and returns 400 otherwise, on POST and DELETE", async () => {
    const { regularMember, comment, task } = await setupFixture();
    mockAuthenticatedSession(regularMember.user);
    const { app } = createApp();

    for (const emoji of ["👍", "1️⃣", "#️⃣"]) {
      const res = await app.request(`/api/intelia/task/${task.id}/reactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      expect(res.status, emoji).toBe(200);
      const del = await app.request(
        `/api/intelia/task/${task.id}/reactions?emoji=${encodeURIComponent(emoji)}`,
        { method: "DELETE" },
      );
      expect(del.status, emoji).toBe(200);
    }

    for (const emoji of ["👍1", "123🚀", "👍👍", "notanemoji", ""]) {
      const post = await app.request(
        `/api/intelia/comment/${comment.id}/reactions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ emoji }),
        },
      );
      expect(post.status, emoji).toBe(400);
      const del = await app.request(
        `/api/intelia/comment/${comment.id}/reactions?emoji=${encodeURIComponent(emoji)}`,
        { method: "DELETE" },
      );
      expect(del.status, emoji).toBe(400);
    }
  });

  it("returns 404 outside the workspace and 403 to a viewer that reacts", async () => {
    const { adminMember, outsider, comment, task } = await setupFixture();
    const { app } = createApp();
    const post = (path: string) =>
      app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emoji: "👍" }),
      });
    const commentPath = `/api/intelia/comment/${comment.id}/reactions`;
    const taskPath = `/api/intelia/task/${task.id}/reactions`;

    mockAuthenticatedSession(outsider.user);
    expect((await app.request(commentPath)).status).toBe(404);
    expect((await post(commentPath)).status).toBe(404);
    expect((await app.request(taskPath)).status).toBe(404);
    expect((await post(taskPath)).status).toBe(404);

    const viewer = await createWorkspaceMember({ role: "viewer" });
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: adminMember.workspace.id,
      userId: viewer.user.id,
      role: "viewer",
      joinedAt: new Date(),
    });
    mockAuthenticatedSession(viewer.user);
    expect((await app.request(commentPath)).status).toBe(200);
    expect((await post(commentPath)).status).toBe(403);
    expect((await app.request(taskPath)).status).toBe(200);
    expect((await post(taskPath)).status).toBe(403);
  });

  it("returns exactly one 200 and one 404 for concurrent DELETEs of the same reaction", async () => {
    const { regularMember, comment, task } = await setupFixture();
    mockAuthenticatedSession(regularMember.user);
    const { app } = createApp();

    // 1. Add reaction on comment
    await app.request(`/api/intelia/comment/${comment.id}/reactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emoji: "👍" }),
    });

    // Fire two concurrent DELETEs
    const [resA, resB] = await Promise.all([
      app.request(
        `/api/intelia/comment/${comment.id}/reactions?emoji=${encodeURIComponent("👍")}`,
        { method: "DELETE" },
      ),
      app.request(
        `/api/intelia/comment/${comment.id}/reactions?emoji=${encodeURIComponent("👍")}`,
        { method: "DELETE" },
      ),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 404]);

    // 2. Add reaction on task card
    await app.request(`/api/intelia/task/${task.id}/reactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emoji: "🚀" }),
    });

    // Fire two concurrent DELETEs on card
    const [taskResA, taskResB] = await Promise.all([
      app.request(
        `/api/intelia/task/${task.id}/reactions?emoji=${encodeURIComponent("🚀")}`,
        { method: "DELETE" },
      ),
      app.request(
        `/api/intelia/task/${task.id}/reactions?emoji=${encodeURIComponent("🚀")}`,
        { method: "DELETE" },
      ),
    ]);

    const taskStatuses = [taskResA.status, taskResB.status].sort();
    expect(taskStatuses).toEqual([200, 404]);
  });
});
