import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { taskClassificationTable } from "../../apps/api/src/intelia/schema";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { readErrorBody } from "./helpers/error-body";

beforeEach(resetTestDatabase);

async function fixture(role: "member" | "viewer" = "member") {
  const member = await createWorkspaceMember({ role });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      id: "classification-task",
      projectId: project.id,
      title: "Original",
      description: "Original description",
      number: 1,
      position: 100,
      status: "planned",
      priority: "low",
    })
    .returning();
  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  const update = (body: unknown) =>
    app.request("/api/task/classification/classification-task", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return { task, update };
}

describe("task classification update", () => {
  it("preserves concurrent changes to other task fields", async () => {
    const { task, update } = await fixture();
    const [response] = await Promise.all([
      update({
        type: "implementacion",
        validationInProduction: "requerida",
        validationInProductionReason: null,
      }),
      db
        .update(schema.taskTable)
        .set({
          title: "Concurrent title",
          description: "Concurrent description",
          priority: "high",
          position: 200,
        })
        .where(eq(schema.taskTable.id, task.id)),
    ]);
    expect(response.status).toBe(200);
    const [after] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    expect(after).toMatchObject({
      title: "Concurrent title",
      description: "Concurrent description",
      priority: "high",
      position: 200,
    });
    const [classification] = await db
      .select()
      .from(taskClassificationTable)
      .where(eq(taskClassificationTable.taskId, task.id));
    expect(classification).toMatchObject({
      type: "implementacion",
      validationInProduction: "requerida",
      validationInProductionReason: null,
    });
  });

  it("rejects invalid declarations and unrelated fields without writing", async () => {
    const { task, update } = await fixture();
    expect(
      (
        await update({
          type: "implementacion",
          validationInProduction: "no_aplica",
          validationInProductionReason: " ",
        })
      ).status,
    ).toBe(400);
    expect((await update({ type: "diseno", title: "Overwrite" })).status).toBe(
      400,
    );
    expect(
      await db
        .select()
        .from(taskClassificationTable)
        .where(eq(taskClassificationTable.taskId, task.id)),
    ).toHaveLength(0);
  });

  it("requires task:update permission", async () => {
    const { task, update } = await fixture("viewer");
    const response = await update({ type: "diseno" });
    expect(response.status).toBe(403);
    expect(await readErrorBody(response)).toMatchObject({
      code: "MISSING_PERMISSION",
      missingPermissions: ["task:update"],
    });
    expect(
      await db
        .select()
        .from(taskClassificationTable)
        .where(eq(taskClassificationTable.taskId, task.id)),
    ).toHaveLength(0);
  });
});
