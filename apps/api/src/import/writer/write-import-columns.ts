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
  count: number;
};

export async function writeImportColumns(
  tx: Transaction,
  projectId: string,
  plan: ImportColumnPlan,
): Promise<ImportBoard> {
  if (plan.columns.length === 0) {
    const defaults = await tx
      .select({
        id: columnTable.id,
        slug: columnTable.slug,
        isFinal: columnTable.isFinal,
      })
      .from(columnTable)
      .where(eq(columnTable.projectId, projectId))
      .orderBy(asc(columnTable.position));
    return {
      byKey: new Map(),
      fallback:
        defaults.find((column) => !isRequestedStatus(column.slug)) ??
        defaults[0] ??
        null,
      archive: archiveColumn(defaults) ?? null,
      count: defaults.length,
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
    count: planned.length,
  };
}
