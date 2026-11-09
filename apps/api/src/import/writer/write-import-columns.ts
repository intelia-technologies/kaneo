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
import type { ImportColumnPlan } from "./plan-import-columns";
import type { BoardColumn } from "./plan-import-tasks";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ImportBoard = {
  byKey: Map<string, BoardColumn>;
  fallback: BoardColumn | null;
  count: number;
};

export async function writeImportColumns(
  tx: Transaction,
  projectId: string,
  plan: ImportColumnPlan,
): Promise<ImportBoard> {
  if (plan.columns.length === 0) {
    const defaults = await tx
      .select({ id: columnTable.id, slug: columnTable.slug })
      .from(columnTable)
      .where(eq(columnTable.projectId, projectId))
      .orderBy(asc(columnTable.position));
    return {
      byKey: new Map(),
      fallback:
        defaults.find((column) => !isRequestedStatus(column.slug)) ??
        defaults[0] ??
        null,
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

  const byKey = new Map(
    planned.map(({ key, row }) => [key, { id: row.id, slug: row.slug }]),
  );
  const first = planned[0]?.row;
  return {
    byKey,
    fallback: first ? { id: first.id, slug: first.slug } : null,
    count: planned.length,
  };
}
