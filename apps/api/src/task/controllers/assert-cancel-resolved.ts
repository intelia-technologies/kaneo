import { and, eq, inArray, notInArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../../database";
import { taskRelationTable, taskTable } from "../../database/schema";
import { buildChain } from "../../intelia/task-cancel/chain";
import {
  type DependenciesError,
  dependenciesErrorBody,
} from "../../intelia/task-cancel/error-body";
import { cancelGuardEnabled } from "../../intelia/task-cancel/guard";
import { compareTickets } from "../../intelia/task-cancel/keys";
import { loadGraph } from "../../intelia/task-cancel/load-graph";
import { applyResolutions } from "../../intelia/task-cancel/resolve";
import { isCancelledStatus } from "../../intelia/task-request/service";

type TaskTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Locked = { id: string; status: string };

const CLOSED = ["done", "cancelled", "canceled"];

/**
 * The guard of the old paths that cancel (design 82, decisions 17 and 18).
 * Call after locking `tasks` and before any write. With `INTELIA_CANCEL_GUARD`
 * on, each task that moves to a cancelled column must not leave open
 * dependents undecided: those in the same operation (`next` covers them) count
 * as cancelled with it; any other one, of this board or another, is the 409
 * `DEPENDENCIAS_SIN_RESOLVER` of `/cancel` for the whole operation. These
 * paths take no `resoluciones` nor `motivo`: that is `/cancel`.
 */
export async function assertCancelResolved(
  tx: TaskTransaction,
  tasks: readonly Locked[],
  next: string | ReadonlyMap<string, string>,
  userId: string,
) {
  if (!cancelGuardEnabled()) return;
  const roots = tasks.filter((task) => {
    const status = typeof next === "string" ? next : next.get(task.id);
    return (
      status !== undefined &&
      isCancelledStatus(status) &&
      !isCancelledStatus(task.status)
    );
  });
  await assertChainsInside(tx, roots, userId, "cancel");
}

/**
 * Deleting a task drops its relations with it (FK cascade), so a task with
 * open dependents gets the same 409 and must be cancelled first (decision
 * 24). The tasks deleted together count as one batch. A closed task is left
 * out: a done one already fulfilled its dependents, and a cancelled one went
 * through the guard, or predates it.
 */
export async function assertDeleteResolved(
  tx: TaskTransaction,
  tasks: readonly Locked[],
  userId: string,
) {
  if (!cancelGuardEnabled()) return;
  const roots = tasks.filter((task) => !CLOSED.includes(task.status));
  await assertChainsInside(tx, roots, userId, "delete");
}

async function assertChainsInside(
  tx: TaskTransaction,
  roots: readonly Locked[],
  userId: string,
  kind: "cancel" | "delete",
) {
  if (!roots.length) return;
  // One query for the common case: which of them have any open dependent.
  const withDependents = await tx
    .selectDistinct({ id: taskRelationTable.sourceTaskId })
    .from(taskRelationTable)
    .innerJoin(taskTable, eq(taskRelationTable.targetTaskId, taskTable.id))
    .where(
      and(
        eq(taskRelationTable.relationType, "blocks"),
        inArray(
          taskRelationTable.sourceTaskId,
          roots.map((task) => task.id),
        ),
        notInArray(taskTable.status, CLOSED),
      ),
    )
    .orderBy(taskRelationTable.sourceTaskId);
  if (!withDependents.length) return;

  const lote = new Set(roots.map((task) => task.id));
  const outside: {
    body: DependenciesError;
    ticket: string;
    visible: boolean;
  }[] = [];
  for (const { id } of withDependents) {
    const graph = await loadGraph(tx, id, userId);
    if (!graph) continue;
    const chain = buildChain(graph);
    if (!chain.length) continue;
    const aplicacion = applyResolutions(chain, [], {
      root: graph.root.ticket,
      lote,
    });
    // Another board's dependent is never decided here: unless it goes in the
    // batch too, it needs `/cancel` and its `motivo`.
    const leaves =
      aplicacion.pendientes.length > 0 ||
      aplicacion.efectos.otrosTableros.some((e) => !lote.has(e.node.task.id));
    if (!leaves) continue;
    outside.push({
      ticket: graph.root.ticket,
      visible: graph.root.visible,
      body: dependenciesErrorBody({
        root: graph.root,
        chain,
        aplicacion,
        motivoRecibido: false,
        conResoluciones: false,
      }),
    });
  }
  if (!outside.length) return;

  outside.sort((a, b) => compareTickets(a.ticket, b.ticket));
  const [first, ...others] = outside;
  const body = first!.body;
  let message =
    kind === "delete"
      ? `${first!.ticket} tiene tareas abiertas que dependen de ella fuera de esta operación: borrarla quitaría esas dependencias sin decidir nada. Cancélala antes, diciendo qué pasa con cada una con \`resoluciones\` y un \`motivo\`, y después bórrala.`
      : body.message;
  const named = others.filter((o) => o.visible).map((o) => o.ticket);
  if (others.length)
    message += ` En esta operación, también tienen dependientes fuera de ella: ${named.length ? named.join(", ") : "otras tareas"}${named.length < others.length ? ` y ${others.length - named.length} más` : ""}. No ha cambiado nada.`;
  throw new HTTPException(409, {
    res: Response.json({ ...body, message }, { status: 409 }),
  });
}
