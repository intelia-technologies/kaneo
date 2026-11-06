import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { taskClassificationTable } from "../../apps/api/src/intelia/schema";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

beforeEach(async () => {
  await resetTestDatabase();
});

async function setup() {
  const member = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  return (classification: Record<string, unknown>) =>
    app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Classification",
        description: "",
        status: "to-do",
        priority: "low",
        ...classification,
      }),
    });
}

describe("task creation classification", () => {
  it.each([{}, { type: null }])(
    "creates a task without classification for %o",
    async (classification) => {
      const create = await setup();
      const response = await create(classification);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ type: null });
      expect(await db.select().from(taskClassificationTable)).toHaveLength(0);
    },
  );

  it.each([
    { validationInProduction: "requerida" },
    { type: "unknown" },
    { type: "implementacion" },
    { type: "operacion", validationInProduction: "no_aplica" },
    {
      type: "operacion",
      validationInProduction: "no_aplica",
      validationInProductionReason: "  ",
    },
    {
      type: "implementacion",
      validationInProduction: "no_aplica",
      validationInProductionReason: "two\nlines",
    },
    { type: "validacion", validationInProduction: "requerida" },
    { type: "diseno", validationInProductionReason: "unexpected" },
  ])("rejects invalid declaration %#", async (classification) => {
    const create = await setup();
    expect((await create(classification)).status).toBe(400);
    expect(await db.select().from(taskClassificationTable)).toHaveLength(0);
  });

  it.each([
    {
      type: "diseno",
      validationInProduction: null,
      validationInProductionReason: null,
    },
    {
      type: "validacion",
      validationInProduction: null,
      validationInProductionReason: null,
    },
    {
      type: "implementacion",
      validationInProduction: "requerida",
      validationInProductionReason: null,
    },
    {
      type: "operacion",
      validationInProduction: "no_aplica",
      validationInProductionReason: "Covered in CI",
    },
  ])("persists and returns a valid declaration %#", async (classification) => {
    const create = await setup();
    const response = await create(classification);
    expect(response.status).toBe(200);
    const task = (await response.json()) as { id: string };
    expect(task).toMatchObject(classification);
    const [stored] = await db
      .select()
      .from(taskClassificationTable)
      .where(eq(taskClassificationTable.taskId, task.id));
    expect(stored).toMatchObject(classification);
  });
});
