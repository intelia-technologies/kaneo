import { inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { publishTaskMutation } from "../../task/controllers/task-mutation-effects";
import { notifyAutomationChanged } from "../task-automation/event";
import type { AutomationWriter, Transaction } from "../task-automation/service";
import { isCancelledStatus } from "../task-request/service";
import { type Applied, applyCancellation } from "./apply";
import { buildChain, chainFingerprint } from "./chain";
import { dependenciesErrorBody } from "./error-body";
import { notifyCancelledWithDependents } from "./event";
import { cancelGuardEnabled } from "./guard";
import { loadForwardEdges, loadGraph, loadTargets } from "./load-graph";
import { applyResolutions, type ResolveContext } from "./resolve";
import type {
  ChainNode,
  Efectos,
  Graph,
  GraphTask,
  Problema,
  RawResolution,
} from "./types";

export type CancelInput = {
  motivo?: string;
  resoluciones?: RawResolution[];
  actor?: string;
  firma?: string;
  lote?: string[];
};

export type CancelResult = {
  canceladas: string[];
  quitadas: string[];
  movidas: { tarea: string; de: string[]; a: string }[];
  otros_tableros: (
    | { tarea: string; responsable: string | null }
    | { oculta: true; tablero: string }
  )[];
  comentarios: number;
};

const NO_EFFECTS: Efectos = {
  enCascada: [],
  quitadas: [],
  movidas: [],
  otrosTableros: [],
};

async function readGraph(
  ex: typeof db | Transaction,
  taskId: string,
  userId: string,
) {
  const graph = await loadGraph(ex, taskId, userId);
  if (!graph) throw new HTTPException(404, { message: "Task not found" });
  return graph;
}

/** An already cancelled task stays as it is: a retry changes nothing, like today. */
const alreadyCancelled = (ticket: string): CancelResult => ({
  canceladas: [ticket],
  quitadas: [],
  movidas: [],
  otros_tableros: [],
  comentarios: 0,
});

/**
 * Resolutions decided on a chain that no longer exists (the root cancelled by
 * someone else, or nothing left hanging from it): refused with
 * `cadena_cambiada` instead of silently dropped (§4.3, step 3 of §7).
 */
const staleResolutions = (
  graph: Graph,
  problemas: Problema[],
  motivoRecibido: boolean,
) =>
  new HTTPException(409, {
    res: Response.json(
      dependenciesErrorBody({
        root: graph.root,
        chain: buildChain(graph),
        aplicacion: { pendientes: [], problemas, efectos: NO_EFFECTS },
        motivoRecibido,
        conResoluciones: true,
      }),
      { status: 409 },
    ),
  });

const rootCancelled = (root: GraphTask): Problema[] => [
  {
    tarea: root.ticket,
    problema: "cadena_cambiada",
    detalle:
      "Ya está cancelada: otra cancelación se ha aplicado antes que la tuya y tus resoluciones no se han aplicado. Revisa la cadena.",
  },
];

/** Same nodes with the same relations and kind (decision 12). */
function sameChain(a: readonly ChainNode[], b: readonly ChainNode[]) {
  const before = chainFingerprint(a);
  const after = chainFingerprint(b);
  return (
    before.size === after.size &&
    [...after].every(([k, v]) => before.get(k) === v)
  );
}

/**
 * Cancels a task deciding at once what happens to what hangs from it (design
 * 82 §4.3), in one transaction:
 * - without open dependents, or with the guard off and no `resoluciones`, as
 *   before: only the task (and its routine paused), with a comment if a
 *   `motivo` comes;
 * - otherwise the resolutions must cover the chain of the moment and bring a
 *   `motivo`, or 409 `DEPENDENCIAS_SIN_RESOLVER` and nothing changes. They are
 *   checked first, and again under the lock of every affected task (taken in
 *   id order, so two overlapping cancellations wait instead of deadlocking):
 *   a chain that changed in between is a 409 with `cadena_cambiada`. A root
 *   already cancelled (before the call or by the winner of a race) is a 200
 *   with nothing written, unless `resoluciones` came: they were decided on a
 *   chain that is gone, so it is that 409 too, as is `resoluciones` for a
 *   root nothing hangs from any more.
 *
 * `onLocked` runs inside the transaction with the rows locked, before
 * anything is written: a caller's own checks and writes (the rejection of a
 * request) commit or fail with the cancellation. With it, a task already
 * cancelled is left to `onLocked` to refuse instead of answering as done.
 */
export async function cancelTask({
  taskId,
  workspaceId,
  userId,
  userName,
  writer,
  input,
  onLocked,
}: {
  taskId: string;
  workspaceId: string;
  userId: string;
  userName: string | null;
  writer: AutomationWriter;
  input: CancelInput;
  onLocked?: (tx: Transaction, root: GraphTask) => Promise<void>;
}): Promise<CancelResult> {
  const resoluciones = input.resoluciones ?? [];
  const graph = await readGraph(db, taskId, userId);
  if (isCancelledStatus(graph.root.status) && !onLocked) {
    if (resoluciones.length)
      throw staleResolutions(
        graph,
        rootCancelled(graph.root),
        input.motivo !== undefined,
      );
    return alreadyCancelled(graph.root.ticket);
  }
  const chain = buildChain(graph);
  // What they resolved left the chain before this call: none of it applies.
  if (chain.length === 0 && resoluciones.length)
    throw staleResolutions(
      graph,
      [...new Set(resoluciones.map((r) => r.tarea))].map((tarea) => ({
        tarea,
        problema: "cadena_cambiada",
        detalle: "Ya no está en la cadena.",
      })),
      input.motivo !== undefined,
    );
  const guard = cancelGuardEnabled();
  const plain = chain.length === 0 || (!guard && resoluciones.length === 0);

  const movers = resoluciones.filter((r) => r.accion === "mover" && r.a);
  const moverTargets = [...new Set(movers.map((r) => r.a!))];
  const ctx: ResolveContext = {
    root: graph.root.ticket,
    lote: input.lote ? new Set(input.lote) : undefined,
  };
  // Resolves against `nodes`; anything left to decide or wrong is the 409.
  const check = async (
    ex: typeof db | Transaction,
    current: Graph,
    nodes: ChainNode[],
    targets: ResolveContext["targets"],
    previous?: ChainNode[],
  ) => {
    const moverIds = nodes
      .filter((n) => movers.some((r) => r.tarea === n.task.ticket))
      .map((n) => n.task.id);
    const edges = moverIds.length ? await loadForwardEdges(ex, moverIds) : [];
    const aplicacion = applyResolutions(nodes, resoluciones, {
      ...ctx,
      targets,
      previous,
      edges,
    });
    if (
      aplicacion.pendientes.length ||
      aplicacion.problemas.length ||
      input.motivo === undefined
    )
      throw new HTTPException(409, {
        res: Response.json(
          dependenciesErrorBody({
            root: current.root,
            chain: nodes,
            aplicacion,
            motivoRecibido: input.motivo !== undefined,
            conResoluciones: resoluciones.length > 0,
          }),
          { status: 409 },
        ),
      });
    return aplicacion.efectos;
  };
  const targets = await loadTargets(db, workspaceId, moverTargets, userId);
  if (!plain) await check(db, graph, chain, targets);

  const quien = input.firma ?? input.actor ?? userName ?? userId;
  const done = await db.transaction(async (tx) => {
    // The automation writers' lock first, then the rows, both in id order:
    // `setAutomation` takes them in that order too, so neither waits on the
    // other in a cycle.
    const otherBoards = chain
      .filter((n) => n.tipo === "otro_tablero")
      .map((n) => n.task.id)
      .sort();
    for (const id of otherBoards)
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`intelia.task_automation:${id}`}))`,
      );
    const lockIds = new Set([
      graph.root.id,
      ...chain.map((n) => n.task.id),
      ...[...targets.values()].flatMap((t) => (t ? [t.id] : [])),
    ]);
    await tx
      .select({ id: taskTable.id })
      .from(taskTable)
      .where(inArray(taskTable.id, [...lockIds]))
      .orderBy(taskTable.id)
      .for("update");
    const locked = await readGraph(tx, taskId, userId);
    await onLocked?.(tx, locked.root);
    // Cancelled meanwhile by someone else: nothing left to do, but the
    // resolutions it brought are refused, not dropped.
    if (isCancelledStatus(locked.root.status)) {
      if (resoluciones.length)
        throw staleResolutions(
          locked,
          rootCancelled(locked.root),
          input.motivo !== undefined,
        );
      return null;
    }
    const now = buildChain(locked);
    // The targets as they are now that they are locked (one may have been
    // cancelled since the check).
    const lockedTargets = await loadTargets(
      tx,
      workspaceId,
      moverTargets,
      userId,
    );
    let efectos = NO_EFFECTS;
    // A chain nobody saw is never applied: the check reports what changed,
    // also when it emptied (another cancellation took the last dependent).
    // Without resolutions to check and nothing hanging, it cancels as before.
    const changed = !sameChain(chain, now);
    if ((!plain || guard) && (now.length > 0 || (!plain && changed)))
      efectos = await check(
        tx,
        locked,
        now,
        lockedTargets,
        changed ? chain : undefined,
      );
    const applied = await applyCancellation(tx, {
      root: locked.root,
      efectos,
      motivo: input.motivo,
      quien,
      userId,
      firma: input.firma,
      writer,
      targets: lockedTargets,
    });
    return { applied, efectos, root: locked.root };
  });
  if (!done) return alreadyCancelled(graph.root.ticket);
  const { applied, efectos, root } = done;

  await publishApplied(applied, userId, quien);
  const result: CancelResult = {
    canceladas: [root.ticket, ...efectos.enCascada.map((n) => n.task.ticket)],
    quitadas: efectos.quitadas.map((e) => e.node.task.ticket),
    movidas: efectos.movidas.map((e) => ({
      tarea: e.node.task.ticket,
      de: e.de,
      a: e.a,
    })),
    otros_tableros: efectos.otrosTableros.map((e) =>
      e.node.oculta
        ? { oculta: true as const, tablero: e.node.task.projectSlug }
        : { tarea: e.node.task.ticket, responsable: e.node.task.responsable },
    ),
    comentarios: applied.comments.length,
  };
  if (efectos !== NO_EFFECTS) {
    void notifyCancelledWithDependents(root, userId, {
      raiz: root.ticket,
      actor: input.actor ?? `kaneo:${userId}`,
      motivo: input.motivo!,
      canceladas: result.canceladas,
      quitadas: result.quitadas,
      movidas: result.movidas,
      otros_tableros: efectos.otrosTableros.map((e) => ({
        tarea: e.node.task.ticket,
        proyecto: e.node.task.projectId,
        responsable: e.node.task.responsable,
      })),
      en: new Date().toISOString(),
    }).catch((error) =>
      console.error("intelia.task.cancelled_with_dependents delivery failed", {
        error: error instanceof Error ? error.message : String(error),
        taskId: root.id,
      }),
    );
  }
  return result;
}

/**
 * The events of everything committed: the same ones each change sends alone.
 * A relation between two projects goes out twice, to each end's project, each
 * without the other end's id: the live boards of a project only learn ids of
 * that project, whatever the canceller reads.
 */
async function publishApplied(applied: Applied, userId: string, quien: string) {
  if (applied.createdColumn)
    await publishEvent("project.updated", {
      projectId: applied.cancelled[0]!.after.projectId,
    });
  for (const { before, after } of applied.cancelled)
    await publishTaskMutation(before, after, userId, { fields: ["status"] });

  const ids = new Set([
    ...[...applied.deleted, ...applied.created].flatMap((r) => [
      r.sourceTaskId,
      r.targetTaskId,
    ]),
    ...applied.comments.map((c) => c.taskId),
  ]);
  const projectOf = new Map(
    ids.size
      ? (
          await db
            .select({ id: taskTable.id, projectId: taskTable.projectId })
            .from(taskTable)
            .where(inArray(taskTable.id, [...ids]))
        ).map((t) => [t.id, t.projectId])
      : [],
  );
  for (const [event, relations] of [
    ["task-relation.deleted", applied.deleted],
    ["task-relation.created", applied.created],
  ] as const)
    for (const relation of relations) {
      const { sourceTaskId, targetTaskId, ...rest } = relation;
      if (projectOf.get(sourceTaskId) === projectOf.get(targetTaskId)) {
        await publishEvent(event, {
          ...relation,
          taskId: sourceTaskId,
          projectId: projectOf.get(sourceTaskId),
          userId,
        });
        continue;
      }
      await publishEvent(event, {
        ...rest,
        sourceTaskId,
        taskId: sourceTaskId,
        projectId: projectOf.get(sourceTaskId),
        userId,
      });
      await publishEvent(event, {
        ...rest,
        targetTaskId,
        taskId: targetTaskId,
        projectId: projectOf.get(targetTaskId),
        userId,
      });
    }
  for (const change of applied.automation)
    void notifyAutomationChanged(change.taskId, change).catch((error) =>
      console.error("task.automation_changed delivery failed", {
        error: error instanceof Error ? error.message : String(error),
        taskId: change.taskId,
      }),
    );
  for (const activity of applied.comments)
    await publishEvent("comment.created", {
      ...activity,
      comment: `**${quien}** commented:\n> ${activity.content}`,
      projectId: projectOf.get(activity.taskId),
    });
}
