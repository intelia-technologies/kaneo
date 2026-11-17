import { sendToStatusWebhooks } from "../webhooks";

export const CANCELLED_WITH_DEPENDENTS_EVENT =
  "intelia.task.cancelled_with_dependents";

export type CancelledWithDependents = {
  raiz: string;
  actor: string;
  motivo: string;
  canceladas: string[];
  quitadas: string[];
  movidas: { tarea: string; de: string[]; a: string }[];
  otros_tableros: {
    tarea: string;
    proyecto: string;
    responsable: string | null;
  }[];
  en: string;
};

type OtroTablero = CancelledWithDependents["otros_tableros"][number] & {
  taskId: string;
  /** In a project the canceller does not read (decision 15). */
  oculta: boolean;
};

/**
 * `intelia.task.cancelled_with_dependents` (§4.6) once committed, through the
 * project webhooks like `task.automation_changed`. A project's webhooks only
 * learn the tasks of another board the canceller can read: the root's project
 * gets those, and each project with a task the canceller does not read gets
 * the same event with its own tasks only. Between them, a receiver that
 * listens to every project (the dispatcher) sees each task once. Body
 * documented in README-INTELIA.md.
 */
export async function notifyCancelledWithDependents(
  root: { id: string; projectId: string },
  userId: string,
  data: Omit<CancelledWithDependents, "otros_tableros">,
  otros: OtroTablero[],
) {
  const deliveries = new Map<string, { taskId: string; otros: OtroTablero[] }>([
    [
      root.projectId,
      { taskId: root.id, otros: otros.filter((o) => !o.oculta) },
    ],
  ]);
  for (const o of otros.filter((o) => o.oculta)) {
    const delivery = deliveries.get(o.proyecto) ?? {
      taskId: o.taskId,
      otros: [],
    };
    delivery.otros.push(o);
    deliveries.set(o.proyecto, delivery);
  }
  await Promise.all(
    [...deliveries].map(([projectId, { taskId, otros }]) =>
      sendToStatusWebhooks(
        CANCELLED_WITH_DEPENDENTS_EVENT,
        taskId,
        projectId,
        userId,
        {
          ...data,
          otros_tableros: otros.map(({ tarea, proyecto, responsable }) => ({
            tarea,
            proyecto,
            responsable,
          })),
        } satisfies CancelledWithDependents,
      ),
    ),
  );
}
