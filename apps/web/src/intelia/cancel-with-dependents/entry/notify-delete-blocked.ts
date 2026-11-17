import i18n from "i18next";
import { isExternalTaskCancelled } from "@/intelia/dependencies/graph-model";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import { openCancelPanel } from "./cancel-panel-store";
import { dependenciesErrorOf } from "./dependencies-error";
import "../i18n";

/**
 * Deleting a task with open dependents is the 409 of design 82 (decision
 * 24): says why and offers «Cancel first», which opens panel D for the root.
 * A root already cancelled cannot go through `/cancel` again (its dependencies
 * are removed by hand, as the message says), so it gets no offer. False for
 * any other error.
 */
export function notifyDeleteBlocked(
  error: unknown,
  findRoot: (ticket: string) => Pick<Task, "id" | "status"> | undefined,
): boolean {
  const unresolved = dependenciesErrorOf(error);
  if (!unresolved) return false;
  const root = findRoot(unresolved.details.tarea.ticket);
  toast.error(unresolved.message, {
    action:
      root && !isExternalTaskCancelled(root.status)
        ? {
            label: i18n.t("intelia:cancelWithDependents.cancelFirst"),
            onClick: () => openCancelPanel(error, root.id),
          }
        : undefined,
  });
  return true;
}
