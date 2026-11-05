import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture, createWorkspaceMember } from "./helpers/fixtures";

const publish = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../apps/api/src/events", async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  publishEvent: publish,
}));

beforeEach(async () => {
  await resetTestDatabase();
  publish.mockClear();
});

describe("task estimation", () => {
  it("creates, reads, preserves, updates and clears fractional hours", async () => {
    const member = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({ workspaceId: member.workspace.id });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const headers = { "content-type": "application/json" };
    const base = { title: "Estimate", description: "", priority: "low", status: "to-do" };
    const created = await app.request(`/api/task/${project.id}`, {
      method: "POST", headers,
      body: JSON.stringify({ ...base, estimacion_horas: 1.5 }),
    });
    expect(created.status).toBe(200);
    const task = await created.json() as { id: string; position: number; estimacion_horas: number | null };
    expect(task.estimacion_horas).toBe(1.5);
    const detail = await app.request(`/api/task/${task.id}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ estimacion_horas: 1.5 });
    const list = await app.request(`/api/task/tasks/${project.id}`);
    expect(list.status).toBe(200);
    expect(JSON.stringify(await list.json())).toContain('"estimacion_horas":1.5');
    const update = (extra: Record<string, unknown>) => app.request(`/api/task/${task.id}`, {
      method: "PUT", headers,
      body: JSON.stringify({ ...base, projectId: project.id, position: task.position, ...extra }),
    });
    for (const [extra, expected] of [[{}, 1.5], [{ estimacion_horas: 0 }, 0], [{ estimacion_horas: null }, null]] as const) {
      const response = await update(extra);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ estimacion_horas: expected });
      const stored = await db.query.taskTable.findFirst({ where: eq(schema.taskTable.id, task.id) });
      expect(stored?.estimacion_horas).toBe(expected);
    }
    const cleared = await app.request(`/api/task/${task.id}`);
    expect(await cleared.json()).toMatchObject({ estimacion_horas: null });
    publish.mockClear();
    const dedicated = await app.request(`/api/task/estimacion_horas/${task.id}`, {
      method: "PUT", headers, body: JSON.stringify({ estimacion_horas: 2.25 }),
    });
    expect(dedicated.status).toBe(200);
    expect(publish).toHaveBeenCalledExactlyOnceWith("task.updated", {
      taskId: task.id,
      projectId: project.id,
      title: "Estimate",
      status: "to-do",
      userId: member.user.id,
    });
    expect(await db.query.taskTable.findFirst({ where: eq(schema.taskTable.id, task.id) }))
      .toMatchObject({ estimacion_horas: 2.25 });
    for (const invalid of [-1, "2", {}, true]) {
      publish.mockClear();
      const response = await app.request(`/api/task/estimacion_horas/${task.id}`, {
        method: "PUT", headers, body: JSON.stringify({ estimacion_horas: invalid }),
      });
      expect(response.status).toBe(400);
      expect(await db.query.taskTable.findFirst({ where: eq(schema.taskTable.id, task.id) }))
        .toMatchObject({ estimacion_horas: 2.25 });
      expect(publish).not.toHaveBeenCalled();
    }
    expect(await dedicated.json()).toMatchObject({ estimacion_horas: 2.25, title: "Estimate" });
    const clear = await app.request(`/api/task/estimacion_horas/${task.id}`, {
      method: "PUT", headers, body: JSON.stringify({ estimacion_horas: null }),
    });
    expect(clear.status).toBe(200);
    expect(await clear.json()).toMatchObject({ estimacion_horas: null });
  });

  it("rejects negative and nonnumeric estimates", async () => {
    const member = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({ workspaceId: member.workspace.id });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    for (const estimacion_horas of [-1, "2"]) {
      const response = await app.request(`/api/task/${project.id}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Invalid", description: "", priority: "low", status: "to-do", estimacion_horas }),
      });
      expect(response.status).toBe(400);
    }
  });
});
