import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  columnTable,
  taskRelationTable,
  taskTable,
} from "../../database/schema";
import { routineTable, taskAutomationTable } from "../schema";
import {
  type AutomationWriter,
  type LoggedChange,
  type Transaction,
  writeAutomation,
} from "../task-automation/service";
import { isCancelledStatus } from "../task-request/service";
import { cancelComments, pauseReason } from "./comments";
import { insertComments } from "./insert-comments";
import type { Efectos, GraphTask } from "./types";

// The column a cancellation creates where the project has none, as the
// rejection of a request does.
const CANCELLED_COLUMN = { slug: "cancelled", name: "Cancelled" };

type Relation = typeof taskRelationTable.$inferSelect;

export type Applied = {
  createdColumn: boolean;
  cancelled: { before: GraphTask; after: typeof taskTable.$inferSelect }[];
  deleted: Relation[];
  created: Relation[];
  automation: (LoggedChange & { taskId: string; projectId: string })[];
  comments: { id: string; taskId: string; content: string | null }[];
};

async function cancelledColumn(tx: Transaction, projectId: string) {
  const find = async () => {
    const columns = await tx
      .select({
        id: columnTable.id,
        slug: columnTable.slug,
        position: columnTable.position,
      })
      .from(columnTable)
      .where(eq(columnTable.projectId, projectId))
      .orderBy(asc(columnTable.position));
    return { columns, found: columns.find((c) => isCancelledStatus(c.slug)) };
  };
  const first = await find();
  if (first.found) return { column: first.found, created: false };
  // The lock create-column takes: no concurrent column gets the slug.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(1525, hashtext(${projectId}))`,
  );
  const { columns, found } = await find();
  if (found) return { column: found, created: false };
  const [column] = await tx
    .insert(columnTable)
    .values({
      projectId,
      name: CANCELLED_COLUMN.name,
      slug: CANCELLED_COLUMN.slug,
      position: Math.max(-1, ...columns.map((c) => c.position)) + 1,
      isFinal: true,
    })
    .returning({ id: columnTable.id, slug: columnTable.slug });
  return { column: column!, created: true };
}

/**
 * Applies a checked cancellation inside the caller's transaction, with every
 * affected task already locked (§4.3): cancels, pauses their routines
 * (decision 23), removes and moves relations, turns off the automation of the
 * dependents of other boards (decision 3) and writes the comments (§4.6), last.
 */
export async function applyCancellation(
  tx: Transaction,
  {
    root,
    efectos,
    motivo,
    quien,
    userId,
    firma,
    writer,
    targets,
  }: {
    root: GraphTask;
    efectos: Efectos;
    motivo: string | undefined;
    quien: string;
    userId: string;
    firma: string | undefined;
    writer: AutomationWriter;
    /** Each `mover` target by key, checked and locked. */
    targets: ReadonlyMap<string, { id: string } | null>;
  },
): Promise<Applied> {
  const toCancel = [root, ...efectos.enCascada.map((n) => n.task)];
  const { column, created: createdColumn } = await cancelledColumn(
    tx,
    root.projectId,
  );
  const updated = await tx
    .update(taskTable)
    .set({ status: column.slug, columnId: column.id })
    .where(
      inArray(
        taskTable.id,
        toCancel.map((t) => t.id),
      ),
    )
    .returning();
  const after = new Map(updated.map((t) => [t.id, t]));
  const cancelled = toCancel.map((before) => ({
    before,
    after: after.get(before.id)!,
  }));

  await tx
    .update(routineTable)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(
        inArray(
          routineTable.taskId,
          toCancel.map((t) => t.id),
        ),
        eq(routineTable.active, true),
      ),
    );

  const removedIds = [
    ...efectos.quitadas,
    ...efectos.movidas,
    ...efectos.otrosTableros,
  ].flatMap((e) => e.relaciones);
  const deleted = removedIds.length
    ? await tx
        .delete(taskRelationTable)
        .where(inArray(taskRelationTable.id, removedIds))
        .returning()
    : [];

  const created: Relation[] = [];
  for (const m of efectos.movidas) {
    const a = targets.get(m.a)!;
    const [existing] = await tx
      .select({ id: taskRelationTable.id })
      .from(taskRelationTable)
      .where(
        and(
          eq(taskRelationTable.sourceTaskId, a.id),
          eq(taskRelationTable.targetTaskId, m.node.task.id),
          eq(taskRelationTable.relationType, "blocks"),
        ),
      );
    if (existing) continue;
    const [relation] = await tx
      .insert(taskRelationTable)
      .values({
        sourceTaskId: a.id,
        targetTaskId: m.node.task.id,
        relationType: "blocks",
      })
      .returning();
    created.push(relation!);
  }

  const automation: Applied["automation"] = [];
  const automaticaApagada = new Set<string>();
  if (motivo !== undefined) {
    for (const e of efectos.otrosTableros) {
      const task = e.node.task;
      // Its `intelia.task_automation` lock is already held (service.ts).
      const [current] = await tx
        .select({ automatica: taskAutomationTable.automatica })
        .from(taskAutomationTable)
        .where(eq(taskAutomationTable.taskId, task.id));
      // Already off (or never set, which the engine reads as manual): left as is.
      if (!current?.automatica) continue;
      const logged = await writeAutomation(tx, task.id, {
        value: { automatica: false, pausaMotivo: pauseReason(e.de, motivo) },
        writer,
      });
      automaticaApagada.add(task.id);
      if (logged)
        automation.push({
          ...logged,
          taskId: task.id,
          projectId: task.projectId,
        });
    }
  }

  const comments =
    motivo === undefined
      ? []
      : await insertComments(
          tx,
          cancelComments({ quien, motivo, root, efectos, automaticaApagada }),
          userId,
          firma,
        );
  return { createdColumn, cancelled, deleted, created, automation, comments };
}
