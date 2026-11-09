// «Pedida» in every existing project (design 52 §3.2, IM-04), through the
// real startup order: upstream's column migration (migrateColumns), which
// seeds legacy projects without columns with its own four, then ours.
import { asc, eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { ensureRequestedColumns } from "../../apps/api/src/intelia/task-request/ensure-requested-columns";
import { migrateColumns } from "../../apps/api/src/migrations/column-migration";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

beforeEach(resetTestDatabase);

async function board(projectId: string) {
  return (
    await db
      .select({ slug: schema.columnTable.slug })
      .from(schema.columnTable)
      .where(eq(schema.columnTable.projectId, projectId))
      .orderBy(asc(schema.columnTable.position))
  ).map((column) => column.slug);
}

async function emptyProject(workspaceId: string) {
  const { project } = await createProjectFixture({ workspaceId });
  await db
    .delete(schema.columnTable)
    .where(eq(schema.columnTable.projectId, project.id));
  return project.id;
}

it("gives «Pedida» to a legacy project upstream's migration seeds at startup", async () => {
  const { workspace } = await createWorkspaceMember();
  const legacy = await emptyProject(workspace.id);
  const [task] = await db
    .insert(schema.taskTable)
    .values({ projectId: legacy, title: "Vieja", status: "to-do" })
    .returning();

  await migrateColumns();
  await ensureRequestedColumns();

  expect(await board(legacy)).toEqual([
    "pedida",
    "to-do",
    "in-progress",
    "in-review",
    "done",
  ]);
  // Upstream's migration still tied the task to its column.
  const [row] = await db
    .select({ columnId: schema.taskTable.columnId })
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, task!.id));
  expect(row!.columnId).not.toBeNull();
});

it("gives «Pedida» to a project without columns when upstream's migration is already done", async () => {
  const { workspace } = await createWorkspaceMember();
  await db
    .insert(schema.dataMigrationTable)
    .values({ id: "column-workflow-v1" });
  const empty = await emptyProject(workspace.id);

  await migrateColumns();
  await ensureRequestedColumns();

  expect(await board(empty)).toEqual(["pedida"]);
});

it("runs once: later startups neither duplicate nor bring back a deleted «Pedida»", async () => {
  const { workspace } = await createWorkspaceMember();
  const { project } = await createProjectFixture({
    workspaceId: workspace.id,
  });
  const withoutRequested = () =>
    db.delete(schema.columnTable).where(eq(schema.columnTable.slug, "pedida"));
  // A project of before the feature: the default board without «Pedida».
  await withoutRequested();

  await ensureRequestedColumns();
  await ensureRequestedColumns();
  expect(await board(project.id)).toEqual([
    "pedida",
    "to-do",
    "in-progress",
    "in-review",
    "done",
  ]);

  await withoutRequested();
  await ensureRequestedColumns();
  expect(await board(project.id)).not.toContain("pedida");
});
