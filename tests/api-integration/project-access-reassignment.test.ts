import { setTimeout as delay } from "node:timers/promises";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { createRestrictedWorkspace } from "./helpers/project-access/create-restricted-workspace";
import { projectAccessApi } from "./helpers/project-access/project-access-api";
import { readMemberAccessRows } from "./helpers/project-access/read-member-access-rows";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

vi.mock("../../apps/api/src/events", async (original) => ({
  ...(await original<object>()),
  publishEvent: vi.fn(async () => undefined),
}));

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

  it("rechecks task assignment permission after a concurrent role change", async () => {
    const ctx = await createRestrictedWorkspace();
    const actor = await addWorkspaceMember(ctx.workspace.id, "admin");
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "member-editor",
      permission: JSON.stringify({ member: ["update"] }),
    });
    mockAuthenticatedSession(actor);
    let pending: Promise<Response> | undefined;
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(schema.workspaceUserTable)
          .set({ role: "member-editor" })
          .where(eq(schema.workspaceUserTable.userId, actor.id));
        pending = projectAccessApi()(
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
        const deadline = Date.now() + 5000;
        let waiting = 0;
        while (Date.now() < deadline) {
          await tx.execute(sql`select pg_stat_clear_snapshot()`);
          const result =
            await tx.execute(sql`select count(*)::int as count from pg_stat_activity
          where datname = current_database() and pid <> pg_backend_pid()
            and wait_event_type = 'Lock' and query ilike '%workspace_member%'`);
          waiting = Number(result.rows[0]?.count ?? 0);
          if (waiting > 0) break;
          await delay(10);
        }
        expect(waiting).toBeGreaterThan(0);
      });
    } finally {
      await pending?.catch(() => undefined);
    }
    expect((await pending!).status).toBe(403);
    expect(await assignee(ctx.alphaTask.id)).toBe(ctx.restricted.id);
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

  it("replays the original outcome after a lost response and deletion of the destination", async () => {
    const ctx = await createRestrictedWorkspace();
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    mockAuthenticatedSession(ctx.owner);
    const request = projectAccessApi();
    const path = `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`;
    const body = {
      projectAccess: "selected",
      projectIds: [],
      reasignarA: replacement.id,
      operacionId: crypto.randomUUID(),
    };
    const first = await request(path, { method: "PUT", body });
    expect(first.status).toBe(200);
    const original = await first.json();
    expect(original).toMatchObject({ reasignadas: 1, desasignadas: 0 });
    expect(await assignee(ctx.betaTask.id)).toBe(ctx.restricted.id);
    await db
      .delete(schema.userTable)
      .where(eq(schema.userTable.id, replacement.id));
    const replay = await request(path, { method: "PUT", body });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(original);
  });

  it("serializes concurrent requests with the same operation id", async () => {
    const ctx = await createRestrictedWorkspace();
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    mockAuthenticatedSession(ctx.owner);
    const request = projectAccessApi();
    const path = `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`;
    const body = {
      projectAccess: "selected",
      projectIds: [],
      reasignarA: replacement.id,
      operacionId: crypto.randomUUID(),
    };
    const [first, second] = await Promise.all([
      request(path, { method: "PUT", body }),
      request(path, { method: "PUT", body }),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const result = await first.json();
    expect(result).toMatchObject({ reasignadas: 1, desasignadas: 0 });
    expect(await second.json()).toEqual(result);
    expect(await assignee(ctx.alphaTask.id)).toBe(replacement.id);
  });

  it("rejects reuse of an operation id with a different payload without further changes", async () => {
    const ctx = await createRestrictedWorkspace();
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    mockAuthenticatedSession(ctx.owner);
    const request = projectAccessApi();
    const path = `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`;
    const body = {
      projectAccess: "selected",
      projectIds: [],
      reasignarA: replacement.id,
      operacionId: crypto.randomUUID(),
    };
    const first = await request(path, { method: "PUT", body });
    expect(first.status).toBe(200);
    const access = await readMemberAccessRows(
      ctx.workspace.id,
      ctx.restricted.id,
    );
    const conflict = await request(path, {
      method: "PUT",
      body: { ...body, projectIds: [ctx.alpha.id] },
    });
    expect(conflict.status).toBe(409);
    expect(
      await readMemberAccessRows(ctx.workspace.id, ctx.restricted.id),
    ).toEqual(access);
    expect(await assignee(ctx.alphaTask.id)).toBe(replacement.id);
  });

  it("checks current authorization before replaying a cached operation", async () => {
    const ctx = await createRestrictedWorkspace();
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    mockAuthenticatedSession(ctx.owner);
    const request = projectAccessApi();
    const path = `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`;
    const body = {
      projectAccess: "selected",
      projectIds: [],
      reasignarA: replacement.id,
      operacionId: crypto.randomUUID(),
    };
    const first = await request(path, { method: "PUT", body });
    expect(first.status).toBe(200);
    mockAuthenticatedSession(ctx.restricted);
    const replay = await request(path, { method: "PUT", body });
    expect(replay.status).toBe(403);
    expect(await assignee(ctx.alphaTask.id)).toBe(replacement.id);
  });
  it("requires task assignment permission when reassigning", async () => {
    const ctx = await createRestrictedWorkspace();
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "member-editor",
      permission: JSON.stringify({ member: ["update"] }),
    });
    const editor = await addWorkspaceMember(ctx.workspace.id, "member-editor");
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    mockAuthenticatedSession(editor);
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
    expect(response.status).toBe(403);
    expect(await assignee(ctx.alphaTask.id)).toBe(ctx.restricted.id);
  });

  it("rejects operations removing more than one project without changes", async () => {
    const ctx = await createRestrictedWorkspace();
    await restrictToProjects(ctx.workspace.id, ctx.restricted.id, [
      ctx.alpha.id,
      ctx.beta.id,
    ]);
    mockAuthenticatedSession(ctx.owner);
    const before = await readMemberAccessRows(
      ctx.workspace.id,
      ctx.restricted.id,
    );
    const response = await projectAccessApi()(
      `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`,
      {
        method: "PUT",
        body: {
          projectAccess: "selected",
          projectIds: [],
          operacionId: crypto.randomUUID(),
        },
      },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "MULTIPLE_PROJECT_ACCESS_OPERATION",
    });
    expect(
      await readMemberAccessRows(ctx.workspace.id, ctx.restricted.id),
    ).toEqual(before);
    expect(await assignee(ctx.alphaTask.id)).toBe(ctx.restricted.id);
    expect(await assignee(ctx.betaTask.id)).toBe(ctx.restricted.id);
  });

  it("denies another restricted admin access to an actor's results and tombstones", async () => {
    const ctx = await createRestrictedWorkspace();
    const admin = await addWorkspaceMember(ctx.workspace.id, "admin");
    await restrictToProjects(ctx.workspace.id, admin.id, [ctx.beta.id]);
    mockAuthenticatedSession(ctx.owner);
    const request = projectAccessApi();
    const path = `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`;
    const body = {
      projectAccess: "selected",
      projectIds: [],
      operacionId: crypto.randomUUID(),
    };
    const first = await request(path, { method: "PUT", body });
    expect(first.status).toBe(200);
    const original = await first.json();
    const cancelledId = crypto.randomUUID();
    const cancelPath = `${path}/operations/${cancelledId}/cancel-or-result`;
    expect((await request(cancelPath, { method: "POST" })).status).toBe(200);

    mockAuthenticatedSession(admin);
    expect((await request(path, { method: "PUT", body })).status).toBe(403);
    expect(
      (
        await request(
          `${path}/operations/${body.operacionId}/cancel-or-result`,
          { method: "POST" },
        )
      ).status,
    ).toBe(403);
    expect((await request(cancelPath, { method: "POST" })).status).toBe(403);
    expect(
      (
        await request(path, {
          method: "PUT",
          body: { ...body, operacionId: cancelledId },
        })
      ).status,
    ).toBe(403);

    mockAuthenticatedSession(ctx.owner);
    const replay = await request(path, { method: "PUT", body });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(original);
    expect(
      await (await request(cancelPath, { method: "POST" })).json(),
    ).toEqual({ estado: "cancelada" });
  });

  it("canonicalizes project order and scopes operation ids to the target member", async () => {
    const ctx = await createRestrictedWorkspace();
    const anotherMember = await addWorkspaceMember(ctx.workspace.id);
    await restrictToProjects(ctx.workspace.id, ctx.restricted.id, [
      ctx.alpha.id,
      ctx.beta.id,
    ]);
    mockAuthenticatedSession(ctx.owner);
    const request = projectAccessApi();
    const operation = crypto.randomUUID();
    const path = `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`;
    const body = {
      projectAccess: "selected",
      projectIds: [ctx.alpha.id, ctx.beta.id],
      operacionId: operation,
    };
    const first = await request(path, { method: "PUT", body });
    expect(first.status).toBe(200);
    const original = await first.json();
    const replay = await request(path, {
      method: "PUT",
      body: { ...body, projectIds: [ctx.beta.id, ctx.alpha.id] },
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(original);
    const other = await request(
      `/workspace/${ctx.workspace.id}/members/${anotherMember.id}/project-access`,
      { method: "PUT", body: { ...body, projectIds: [ctx.beta.id] } },
    );
    expect(other.status).toBe(200);
  });

  it("rejects stale operations that grant access without recording them, but replays recorded results after changes", async () => {
    const ctx = await createRestrictedWorkspace();
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    mockAuthenticatedSession(ctx.owner);
    const request = projectAccessApi();
    const path = `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`;
    const operacionId = crypto.randomUUID();
    const before = await readMemberAccessRows(
      ctx.workspace.id,
      ctx.restricted.id,
    );
    const stale = await request(path, {
      method: "PUT",
      body: {
        projectAccess: "selected",
        projectIds: [ctx.beta.id],
        reasignarA: replacement.id,
        operacionId,
      },
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: "STALE_ACCESS_OPERATION",
    });
    expect(
      await readMemberAccessRows(ctx.workspace.id, ctx.restricted.id),
    ).toEqual(before);
    expect(await assignee(ctx.alphaTask.id)).toBe(ctx.restricted.id);

    const validBody = {
      projectAccess: "selected",
      projectIds: [],
      reasignarA: replacement.id,
      operacionId,
    };
    const applied = await request(path, { method: "PUT", body: validBody });
    expect(applied.status).toBe(200);
    const original = await applied.json();
    expect(original).toMatchObject({ reasignadas: 1, desasignadas: 0 });
    await restrictToProjects(ctx.workspace.id, ctx.restricted.id, [
      ctx.alpha.id,
    ]);
    const changed = await readMemberAccessRows(
      ctx.workspace.id,
      ctx.restricted.id,
    );
    const replay = await request(path, { method: "PUT", body: validBody });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(original);
    expect(
      await readMemberAccessRows(ctx.workspace.id, ctx.restricted.id),
    ).toEqual(changed);
    expect(await assignee(ctx.alphaTask.id)).toBe(replacement.id);
  });

  it("cancels a pending operation durably and prevents a late PUT", async () => {
    const ctx = await createRestrictedWorkspace();
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    mockAuthenticatedSession(ctx.owner);
    const request = projectAccessApi();
    const path = `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`;
    const operacionId = crypto.randomUUID();
    const cancelPath = `${path}/operations/${operacionId}/cancel-or-result`;
    const before = await readMemberAccessRows(
      ctx.workspace.id,
      ctx.restricted.id,
    );
    for (let i = 0; i < 2; i++) {
      const cancelled = await request(cancelPath, { method: "POST" });
      expect(cancelled.status).toBe(200);
      expect(await cancelled.json()).toEqual({ estado: "cancelada" });
    }
    const late = await request(path, {
      method: "PUT",
      body: {
        projectAccess: "selected",
        projectIds: [],
        reasignarA: replacement.id,
        operacionId,
      },
    });
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({
      code: "CANCELLED_ACCESS_OPERATION",
    });
    expect(
      await readMemberAccessRows(ctx.workspace.id, ctx.restricted.id),
    ).toEqual(before);
    expect(await assignee(ctx.alphaTask.id)).toBe(ctx.restricted.id);
  });

  it("returns the original result when cancellation follows an applied operation", async () => {
    const ctx = await createRestrictedWorkspace();
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    mockAuthenticatedSession(ctx.owner);
    const request = projectAccessApi();
    const path = `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`;
    const operacionId = crypto.randomUUID();
    const applied = await request(path, {
      method: "PUT",
      body: {
        projectAccess: "selected",
        projectIds: [],
        reasignarA: replacement.id,
        operacionId,
      },
    });
    expect(applied.status).toBe(200);
    const result = await request(
      `${path}/operations/${operacionId}/cancel-or-result`,
      { method: "POST" },
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      estado: "aplicada",
      reasignadas: 1,
      desasignadas: 0,
    });
    expect(await assignee(ctx.alphaTask.id)).toBe(replacement.id);
  });

  it("requires authorization to cancel or inspect an operation", async () => {
    const ctx = await createRestrictedWorkspace();
    mockAuthenticatedSession(ctx.restricted);
    const operation = crypto.randomUUID();
    const path = `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`;
    const denied = await projectAccessApi()(
      `${path}/operations/${operation}/cancel-or-result`,
      { method: "POST" },
    );
    expect(denied.status).toBe(403);
    mockAuthenticatedSession(ctx.owner);
    const cancelled = await projectAccessApi()(
      `${path}/operations/${operation}/cancel-or-result`,
      { method: "POST" },
    );
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toEqual({ estado: "cancelada" });
  });

  it("serializes cancellation against a concurrent PUT", async () => {
    const ctx = await createRestrictedWorkspace();
    const replacement = await addWorkspaceMember(ctx.workspace.id);
    mockAuthenticatedSession(ctx.owner);
    const request = projectAccessApi();
    const path = `/workspace/${ctx.workspace.id}/members/${ctx.restricted.id}/project-access`;
    const operacionId = crypto.randomUUID();
    const body = {
      projectAccess: "selected",
      projectIds: [],
      reasignarA: replacement.id,
      operacionId,
    };
    const cancelPath = `${path}/operations/${operacionId.toUpperCase()}/cancel-or-result`;
    const [put, cancel] = await Promise.all([
      request(path, { method: "PUT", body }),
      request(cancelPath, { method: "POST" }),
    ]);
    expect(cancel.status).toBe(200);
    const outcome = await cancel.json();
    if (outcome.estado === "aplicada") {
      expect(put.status).toBe(200);
      expect(outcome).toEqual({
        estado: "aplicada",
        reasignadas: 1,
        desasignadas: 0,
      });
      expect(await assignee(ctx.alphaTask.id)).toBe(replacement.id);
    } else {
      expect(outcome).toEqual({ estado: "cancelada" });
      expect(put.status).toBe(409);
      expect(await assignee(ctx.alphaTask.id)).toBe(ctx.restricted.id);
    }
    const replay = await request(cancelPath, { method: "POST" });
    expect(await replay.json()).toEqual(outcome);
  });
});
