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

/**
 * `intelia.task.cancelled_with_dependents` (§4.6) once committed, through the
 * root's project webhooks, like `task.automation_changed`. The dispatcher sees
 * everything: no hidden nodes. Body documented in README-INTELIA.md.
 */
export function notifyCancelledWithDependents(
  rootId: string,
  projectId: string,
  userId: string,
  data: CancelledWithDependents,
) {
  return sendToStatusWebhooks(
    CANCELLED_WITH_DEPENDENTS_EVENT,
    rootId,
    projectId,
    userId,
    data,
  );
}
