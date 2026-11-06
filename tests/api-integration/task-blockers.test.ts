import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import {
  initiativeTable,
  taskInitiativeTable,
} from "../../apps/api/src/intelia/schema";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetTestDatabase();
});

async function seed(blockerStatus = "to-do") {
  const { user, workspace } = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({ workspaceId: workspace.id });
  await db.insert(schema.columnTable).values([
    {
      projectId: project.id,
      name: "Queued",
      slug: "queued",
      position: 4,
      isFinal: false,
    },
    {
      projectId: project.id,
      name: "Ready to merge",
      slug: "ready-to-merge",
      position: 5,
      isFinal: false,
    },
    {
      projectId: project.id,
      name: "Cancelled",
      slug: "cancelled",
      position: 6,
      isFinal: true,
    },
  ]);
  const [blocker, blocked, free] = await db
    .insert(schema.taskTable)
    .values([
      {
        projectId: project.id,
        title: "Blocker",
        number: 1,
        status: blockerStatus,
      },
      { projectId: project.id, title: "Blocked", number: 2, status: "to-do" },
      { projectId: project.id, title: "Free", number: 3, status: "to-do" },
    ])
    .returning();
  await db.insert(schema.taskRelationTable).values({
    sourceTaskId: blocker.id,
    targetTaskId: blocked.id,
    relationType: "blocks",
  });
  const [initiative] = await db
    .insert(initiativeTable)
    .values({
      projectId: project.id,
      name: "Plan",
      nameKey: "plan",
      source: "session",
    })
    .returning();
  await db.insert(taskInitiativeTable).values({
    taskId: blocked.id,
    initiativeId: initiative.id,
    origin: "plan",
    source: "session",
  });
  mockAuthenticatedSession(user);
  return { project, blocker, blocked, free, initiative };
}

type Mode = "status" | "update" | "bulk";
function change(
  mode: Mode,
  task: typeof schema.taskTable.$inferSelect,
  status: string,
  taskIds = [task.id],
) {
  const url =
    mode === "status"
      ? `/api/task/status/${task.id}`
      : mode === "update"
        ? `/api/task/${task.id}`
        : "/api/task/bulk";
  const body =
    mode === "status"
      ? { status }
      : mode === "update"
        ? {
            title: task.title,
            priority: task.priority,
            projectId: task.projectId,
            position: task.position,
            status,
          }
        : { taskIds, operation: "updateStatus", value: status };
  return createApp().app.request(url, {
    method: mode === "bulk" ? "PATCH" : "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

it.each(["status", "update", "bulk"] as const)(
  "%s rejects active transitions without changing the task or closing its plan",
  async (mode) => {
    const { blocker, blocked, initiative } = await seed();
    for (const status of [
      "queued",
      "in-progress",
      "in-review",
      "ready-to-merge",
    ]) {
      const response = await change(mode, blocked, status);
      expect(response.status).toBe(409);
      expect(JSON.stringify(await response.json())).toContain(blocker.id);
      expect(
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, blocked.id),
        }),
      ).toEqual(blocked);
      expect(
        (
          await db
            .select()
            .from(initiativeTable)
            .where(eq(initiativeTable.id, initiative.id))
        )[0].planClosedAt,
      ).toBeNull();
    }
  },
);

it.each(["status", "update", "bulk"] as const)(
  "%s allows unblocked tasks and completed or cancelled destinations",
  async (mode) => {
    const { blocked, free } = await seed();
    expect((await change(mode, free, "in-progress")).status).toBe(200);
    expect((await change(mode, blocked, "done")).status).toBe(200);
    expect((await change(mode, blocked, "cancelled")).status).toBe(200);
  },
);

it.each(["status", "update", "bulk"] as const)(
  "%s treats only a done blocker as satisfied",
  async (mode) => {
    const { blocker, blocked } = await seed("cancelled");
    expect((await change(mode, blocked, "in-progress")).status).toBe(409);
    await db
      .update(schema.taskTable)
      .set({ status: "done" })
      .where(eq(schema.taskTable.id, blocker.id));
    expect((await change(mode, blocked, "in-progress")).status).toBe(200);
  },
);

it("rejects a bulk transition atomically when any task is blocked", async () => {
  const { blocked, free, initiative } = await seed();
  const response = await change("bulk", free, "in-progress", [
    free.id,
    blocked.id,
  ]);
  expect(response.status).toBe(409);
  expect(
    await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, free.id),
    }),
  ).toEqual(free);
  expect(
    await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, blocked.id),
    }),
  ).toEqual(blocked);
  expect(
    (
      await db
        .select()
        .from(initiativeTable)
        .where(eq(initiativeTable.id, initiative.id))
    )[0].planClosedAt,
  ).toBeNull();
});
