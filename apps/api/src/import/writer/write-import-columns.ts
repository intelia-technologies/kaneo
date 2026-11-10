import { createId } from "@paralleldrive/cuid2";
import { asc, eq } from "drizzle-orm";
import type db from "../../database";
import { columnTable } from "../../database/schema";
import {
  isRequestedStatus,
  REQUESTED_COLUMN_NAME,
  REQUESTED_STATUS,
} from "../../intelia/task-request/status";
import { chunk } from "./chunk";
import { archiveColumn } from "../../intelia/task-archive/archive-column";
import type { ImportColumnPlan } from "./plan-import-columns";
import type { BoardColumn } from "./plan-import-tasks";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ImportBoard = {
  byKey: Map<string, BoardColumn>;
  fallback: BoardColumn | null;
  // Intelia (design 53 §3.2): where archived tasks without a closed column go.
  archive: BoardColumn | null;
  // A final "Done" was added to the project's default columns for them.
  archiveAdded: boolean;
  count: number;
};

export async function writeImportColumns(
  tx: Transaction,
  projectId: string,
  plan: ImportColumnPlan,
  needsArchiveColumn: boolean,
): Promise<ImportBoard> {
  if (plan.columns.length === 0) {
    const defaults = await tx
      .select({
        id: columnTable.id,
        slug: columnTable.slug,
        isFinal: columnTable.isFinal,
        position: columnTable.position,
      })
      .from(columnTable)
      .where(eq(columnTable.projectId, projectId))
      .orderBy(asc(columnTable.position));
    const fallback =
      defaults.find((column) => !isRequestedStatus(column.slug)) ??
      defaults[0] ??
      null;
    const archive = archiveColumn(defaults);
    if (archive || !needsArchiveColumn)
      return {
        byKey: new Map(),
        fallback,
        archive: archive ?? null,
        archiveAdded: false,
        count: defaults.length,
      };
    // The import creates this project, so the column is the import's own.
    const slugs = new Set(defaults.map((column) => column.slug));
    let slug = "done";
    for (let suffix = 2; slugs.has(slug); suffix++) slug = `done-${suffix}`;
    const added = {
      id: createId(),
      projectId,
      name: "Done",
      slug,
      position: Math.max(-1, ...defaults.map((column) => column.position)) + 1,
      isFinal: true,
    };
    await tx.insert(columnTable).values(added);
    return {
      byKey: new Map(),
      fallback,
      archive: { id: added.id, slug, isFinal: true },
      archiveAdded: true,
      count: defaults.length + 1,
    };
  }

  await tx.delete(columnTable).where(eq(columnTable.projectId, projectId));

  // Intelia (design 52 §3.2): every board keeps «Pedida», first.
  const withRequested = !plan.columns.some((column) =>
    isRequestedStatus(column.slug),
  );
  const offset = withRequested ? 1 : 0;
  const planned = plan.columns.map((column) => ({
    key: column.key,
    row: {
      id: createId(),
      projectId,
      name: column.name,
      slug: column.slug,
      position: column.position + offset,
      isFinal: column.isFinal,
    },
  }));
  const rows = planned.map(({ row }) => row);
  if (withRequested)
    rows.unshift({
      id: createId(),
      projectId,
      name: REQUESTED_COLUMN_NAME,
      slug: REQUESTED_STATUS,
      position: 0,
      isFinal: false,
    });
  for (const batch of chunk(rows)) {
    await tx.insert(columnTable).values(batch);
  }

  const columns = planned.map(({ key, row }) => ({
    key,
    column: { id: row.id, slug: row.slug, isFinal: row.isFinal },
  }));
  const byKey = new Map(columns.map(({ key, column }) => [key, column]));
  return {
    byKey,
    fallback: columns[0]?.column ?? null,
    archive: archiveColumn(columns.map(({ column }) => column)) ?? null,
    archiveAdded: false,
    count: planned.length,
  };
}
