import { setTimeout as delay } from "node:timers/promises";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { createRestrictedWorkspace } from "./helpers/project-access/create-restricted-workspace";
import { projectAccessApi } from "./helpers/project-access/project-access-api";
import { readMemberAccessRows } from "./helpers/project-access/read-member-access-rows";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

beforeEach(resetTestDatabase);

async function assignee(taskId: string) {
  const [task] = await db
    .select({ userId: schema.taskTable.userId })
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, taskId));
  return task?.userId;
}

describe("project access reassignment", () => {
  it("reassigns only tasks in lost projects and reports counts", async () => {
    const ctx = await createRestrictedWorkspace();
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    mockAuthenticatedSession(ctx.owner);
    const request = projectAccessApi();
    const response = await request(
      `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`,
      {
        method: "PUT",
        body: {
          projectAccess: "selected",
          projectIds: [ctx.beta.id],
          reasignarA: replacement.id,
        },
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      reasignadas: 1,
      desasignadas: 0,
    });
    expect(await assignee(ctx.alphaTask.id)).toBe(replacement.id);
    expect(await assignee(ctx.betaTask.id)).toBe(ctx.restricted.id);
  });

  it("reassigns tasks from multiple lost projects to the same eligible destination", async () => {
    const ctx = await createRestrictedWorkspace();
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    await restrictToProjects(ctx.workspace.id, ctx.restricted.id, [
      ctx.alpha.id,
      ctx.beta.id,
    ]);
    mockAuthenticatedSession(ctx.owner);
    const response = await projectAccessApi()(
      `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`,
      {
        method: "PUT",
        body: {
          projectAccess: "selected",
          projectIds: [],
          reasignarA: replacement.id,
        },
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      reasignadas: 2,
      desasignadas: 0,
    });
    expect(await assignee(ctx.alphaTask.id)).toBe(replacement.id);
    expect(await assignee(ctx.betaTask.id)).toBe(replacement.id);
  });

  it("reassigns open tasks but unassigns completed tasks in lost projects", async () => {
    const ctx = await createRestrictedWorkspace();
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    const [done] = await db
      .select()
      .from(schema.columnTable)
      .where(eq(schema.columnTable.projectId, ctx.alpha.id))
      .then((columns) => columns.filter((column) => column.isFinal));
    const [completed] = await db
      .insert(schema.taskTable)
      .values({
        projectId: ctx.alpha.id,
        title: "Completed task",
        number: 2,
        userId: ctx.restricted.id,
        status: done!.slug,
        columnId: done!.id,
      })
      .returning();
    mockAuthenticatedSession(ctx.owner);
    const response = await projectAccessApi()(
      `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`,
      {
        method: "PUT",
        body: {
          projectAccess: "selected",
          projectIds: [ctx.beta.id],
          reasignarA: replacement.id,
        },
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      reasignadas: 1,
      desasignadas: 1,
    });
    expect(await assignee(ctx.alphaTask.id)).toBe(replacement.id);
    expect(await assignee(completed!.id)).toBeNull();
    expect(await assignee(ctx.betaTask.id)).toBe(ctx.restricted.id);
  });

  it("unassigns tasks in lost projects when no replacement is supplied", async () => {
    const ctx = await createRestrictedWorkspace();
    mockAuthenticatedSession(ctx.owner);
    const response = await projectAccessApi()(
      `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`,
      {
        method: "PUT",
        body: { projectAccess: "selected", projectIds: [ctx.beta.id] },
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      reasignadas: 0,
      desasignadas: 1,
    });
    expect(await assignee(ctx.alphaTask.id)).toBeNull();
    expect(await assignee(ctx.betaTask.id)).toBe(ctx.restricted.id);
  });

  it("rejects an ineligible replacement without changing access or assignments", async () => {
    const ctx = await createRestrictedWorkspace();
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    await restrictToProjects(ctx.workspace.id, replacement.id, [ctx.beta.id]);
    const before = await readMemberAccessRows(
      ctx.workspace.id,
      ctx.restricted.id,
    );
    mockAuthenticatedSession(ctx.owner);
    const request = projectAccessApi();
    const outsider = await createWorkspaceMember({ role: "owner" });
    for (const replacementId of [
      replacement.id,
      outsider.user.id,
      ctx.restricted.id,
    ]) {
      const response = await request(
        `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`,
        {
          method: "PUT",
          body: {
            projectAccess: "selected",
            projectIds: [ctx.beta.id],
            reasignarA: replacementId,
          },
        },
      );
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(
        await readMemberAccessRows(ctx.workspace.id, ctx.restricted.id),
      ).toEqual(before);
      expect(await assignee(ctx.alphaTask.id)).toBe(ctx.restricted.id);
      expect(await assignee(ctx.betaTask.id)).toBe(ctx.restricted.id);
    }
  });

  it("rolls back access and task changes when a task update fails", async () => {
    const ctx = await createRestrictedWorkspace();
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    const before = await readMemberAccessRows(
      ctx.workspace.id,
      ctx.restricted.id,
    );
    mockAuthenticatedSession(ctx.owner);
    await db.execute(
      sql`CREATE FUNCTION test_reassignment_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected task update failure'; END $$`,
    );
    try {
      await db.execute(
        sql`CREATE TRIGGER test_reassignment_failure BEFORE UPDATE ON task FOR EACH ROW EXECUTE FUNCTION test_reassignment_failure()`,
      );
      const response = await projectAccessApi()(
        `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`,
        {
          method: "PUT",
          body: {
            projectAccess: "selected",
            projectIds: [ctx.beta.id],
            reasignarA: replacement.id,
          },
        },
      );
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(
        await readMemberAccessRows(ctx.workspace.id, ctx.restricted.id),
      ).toEqual(before);
      expect(await assignee(ctx.alphaTask.id)).toBe(ctx.restricted.id);
      expect(await assignee(ctx.betaTask.id)).toBe(ctx.restricted.id);
    } finally {
      await db.execute(
        sql`DROP TRIGGER IF EXISTS test_reassignment_failure ON task`,
      );
      await db.execute(
        sql`DROP FUNCTION IF EXISTS test_reassignment_failure()`,
      );
    }
  });

  it("does not reassign tasks in a project concurrently moved to another workspace", async () => {
    const ctx = await createRestrictedWorkspace();
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    const destination = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(ctx.owner);
    const request = projectAccessApi();
    let accessRequest!: Promise<Response>;

    await db.transaction(async (tx) => {
      await tx
        .update(schema.projectTable)
        .set({ workspaceId: destination.workspace.id })
        .where(eq(schema.projectTable.id, ctx.alpha.id));
      accessRequest = request(
        `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`,
        {
          method: "PUT",
          body: {
            projectAccess: "selected",
            projectIds: [ctx.beta.id],
            reasignarA: replacement.id,
          },
        },
      );

      const deadline = Date.now() + 5000;
      let waiting = 0;
      while (Date.now() < deadline) {
        await tx.execute(sql`select pg_stat_clear_snapshot()`);
        const result =
          await tx.execute(sql`select count(*)::int as count from pg_stat_activity
          where datname = current_database() and pid <> pg_backend_pid()
            and wait_event_type = 'Lock' and query ilike '%project%'`);
        waiting = Number(result.rows[0]?.count ?? 0);
        if (waiting > 0) break;
        await delay(10);
      }
      expect(waiting).toBeGreaterThan(0);
    });

    const response = await accessRequest;
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      reasignadas: 0,
      desasignadas: 0,
    });
    expect(await assignee(ctx.alphaTask.id)).toBe(ctx.restricted.id);
  });

  it("serializes a concurrent assignment with access removal", async () => {
    const ctx = await createRestrictedWorkspace();
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    await db
      .update(schema.taskTable)
      .set({ userId: null })
      .where(eq(schema.taskTable.id, ctx.alphaTask.id));
    mockAuthenticatedSession(ctx.owner);
    const request = projectAccessApi();
    let accessRequest!: Promise<Response>;
    let assignmentRequest!: Promise<Response>;

    // Hold the same membership lock as both operations until both are actually
    // waiting in PostgreSQL, rather than relying on request scheduling.
    await db.transaction(async (tx) => {
      await tx
        .select()
        .from(schema.workspaceUserTable)
        .where(
          sql`${schema.workspaceUserTable.workspaceId} = ${ctx.workspace.id} and ${schema.workspaceUserTable.userId} = ${ctx.restricted.id}`,
        )
        .for("update");
      accessRequest = request(
        `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`,
        {
          method: "PUT",
          body: {
            projectAccess: "selected",
            projectIds: [ctx.beta.id],
            reasignarA: replacement.id,
          },
        },
      );
      assignmentRequest = request(`/task/assignee/${ctx.alphaTask.id}`, {
        method: "PUT",
        body: { userId: ctx.restricted.id },
      });

      const deadline = Date.now() + 5000;
      let waiting = 0;
      while (Date.now() < deadline) {
        await tx.execute(sql`select pg_stat_clear_snapshot()`);
        const result =
          await tx.execute(sql`select count(*)::int as count from pg_stat_activity
          where datname = current_database() and pid <> pg_backend_pid()
            and wait_event_type = 'Lock' and query ilike '%workspace_member%'`);
        waiting = Number(result.rows[0]?.count ?? 0);
        if (waiting >= 2) break;
        // PostgreSQL lock waiters run independently of fake timers.
        await delay(10);
      }
      expect(waiting).toBeGreaterThanOrEqual(2);
    });

    const [access, assignment] = await Promise.all([
      accessRequest,
      assignmentRequest,
    ]);
    expect(access.status).toBe(200);
    expect([200, 403]).toContain(assignment.status);
    if (assignment.status === 200) {
      expect(await assignee(ctx.alphaTask.id)).toBe(replacement.id);
      expect(await access.json()).toMatchObject({
        reasignadas: 1,
        desasignadas: 0,
      });
    } else {
      expect(await assignee(ctx.alphaTask.id)).toBeNull();
      expect(await access.json()).toMatchObject({
        reasignadas: 0,
        desasignadas: 0,
      });
    }
  });
});
