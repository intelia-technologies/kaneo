import { sendToDispatcher } from "../webhooks";

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

/**
 * `intelia.task.cancelled_with_dependents` (§4.6, decision 25) once committed:
 * only to the dispatcher, never through a project's webhooks, because it names
 * tasks of other boards. Body documented in README-INTELIA.md.
 */
export async function notifyCancelledWithDependents(
  root: { id: string; projectId: string },
  userId: string,
  data: CancelledWithDependents,
) {
  await sendToDispatcher(
    CANCELLED_WITH_DEPENDENTS_EVENT,
    root.id,
    root.projectId,
    userId,
    data,
  );
}
