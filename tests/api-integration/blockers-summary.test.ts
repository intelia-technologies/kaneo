import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import getTasks from "../../apps/api/src/task/controllers/get-tasks";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

describe("board blocker summaries", () => {
  beforeEach(resetTestDatabase);

  it("counts incoming unfinished blockers and waits for the deployed release", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const [validation, blocker] = await db
      .insert(schema.taskTable)
      .values([
        {
          projectId: project.id,
          title: "Validation",
          status: "to-do",
          number: 1,
        },
        {
          projectId: project.id,
          title: "Implementation",
          status: "cancelled",
          number: 2,
        },
      ])
      .returning();
    await db.execute(
      sql`insert into intelia.task_classification (task_id, type) values (${validation.id}, 'validacion')`,
    );
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: blocker.id,
      targetTaskId: validation.id,
      relationType: "blocks",
    });
    const summary = async () => {
      const { data } = await getTasks(project.id, {}, member.user.id);
      return data.columns
        .flatMap((column) => column.tasks)
        .find((task) => task.id === validation.id)?.blockersSummary;
    };
    expect(await summary()).toMatchObject({
      pendingCount: 1,
      hasCancelledBlocker: true,
      waitingRelease: false,
      externalCount: 0,
    });
    await db
      .update(schema.taskTable)
      .set({ status: "done" })
      .where(eq(schema.taskTable.id, blocker.id));
    expect(await summary()).toMatchObject({
      pendingCount: 0,
      hasCancelledBlocker: false,
      waitingRelease: true,
      blockers: [],
    });
    const [field] = await db
      .insert(schema.customFieldDefinitionTable)
      .values({ projectId: project.id, name: "release", type: "text" })
      .returning();
    await db.insert(schema.customFieldValueTable).values({
      taskId: validation.id,
      fieldId: field.id,
      value: "desplegada",
    });
    expect(await summary()).toMatchObject({ waitingRelease: false });
  });

  it("does not reveal a private blocker on a public board", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const other = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const [target] = await db
      .insert(schema.taskTable)
      .values({ projectId: project.id, title: "Target", status: "to-do" })
      .returning();
    const [secret] = await db
      .insert(schema.taskTable)
      .values({
        projectId: other.project.id,
        title: "Secret",
        status: "cancelled",
      })
      .returning();
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: secret.id,
      targetTaskId: target.id,
      relationType: "blocks",
    });
    const { data } = await getTasks(project.id, { publicOnly: true });
    const summary = data.columns
      .flatMap((column) => column.tasks)
      .find((task) => task.id === target.id)?.blockersSummary;
    expect(summary).toEqual({
      pendingCount: 1,
      hasCancelledBlocker: false,
      waitingRelease: false,
      blockers: [],
      externalCount: 1,
    });
  });
});
