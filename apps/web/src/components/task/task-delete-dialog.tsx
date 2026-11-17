import type { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useDeleteTask } from "@/hooks/mutations/task/use-delete-task";
import { useShortcut } from "@/lib/shortcuts/use-shortcut";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import { openCancelPanel } from "@/intelia/cancel-with-dependents/entry/cancel-panel-store";
import { dependenciesErrorOf } from "@/intelia/cancel-with-dependents/entry/dependencies-error";
import { isExternalTaskCancelled } from "@/intelia/dependencies/graph-model";
import queryClient from "@/query-client";
import type Task from "@/types/task";
import "@/intelia/cancel-with-dependents/i18n";

type TaskDeleteDialogProps = {
  handle: AlertDialogPrimitive.Handle<unknown>;
  taskId: string;
  onDeleted: () => void;
  shortcutEnabled?: boolean;
};

export default function TaskDeleteDialog({
  handle,
  taskId,
  onDeleted,
  shortcutEnabled = true,
}: TaskDeleteDialogProps) {
  const { t } = useTranslation();
  const { canDeleteTasks, isCheckingPermissions } = useWorkspacePermission();
  const { mutateAsync: deleteTask, isPending } = useDeleteTask();
  const canDelete = !isCheckingPermissions && canDeleteTasks();
  // The 409 of deleting a task with open dependents (design 82, decision
  // 24): the dialog says why and offers to cancel it first.
  const [blocked, setBlocked] = useState<unknown>(null);
  const unresolved = dependenciesErrorOf(blocked);

  useShortcut("deleteTask", () => handle.open(null), {
    enabled: canDelete && shortcutEnabled,
  });

  useEffect(() => {
    return () => {
      handle.close();
      setBlocked(null);
    };
  }, [handle, taskId]);

  if (!canDelete) {
    return null;
  }

  const handleDelete = async () => {
    try {
      await deleteTask(taskId);
      toast.success(t("tasks:delete.success"), { icon: Trash2Icon });
      handle.close();
      onDeleted();
    } catch (error) {
      if (dependenciesErrorOf(error)) {
        setBlocked(error);
        return;
      }
      toast.error(
        error instanceof Error ? error.message : t("tasks:delete.error"),
      );
    }
  };

  // A task already cancelled cannot go through `/cancel` again: its message
  // says to remove the dependencies by hand.
  const canCancelFirst =
    unresolved !== null &&
    !isExternalTaskCancelled(
      queryClient.getQueryData<Task>(["task", taskId])?.status ?? "",
    );
  const cancelFirst = () => {
    handle.close();
    openCancelPanel(blocked, taskId);
  };

  return (
    <AlertDialog
      handle={handle}
      onOpenChangeComplete={(open) => !open && setBlocked(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {unresolved
              ? t("intelia:cancelWithDependents.deleteBlocked")
              : t("tasks:delete.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {unresolved ? unresolved.message : t("tasks:delete.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose
            render={<Button variant="outline" size="sm" disabled={isPending} />}
          >
            {t("common:actions.cancel")}
          </AlertDialogClose>
          {canCancelFirst ? (
            <Button variant="destructive" size="sm" onClick={cancelFirst}>
              {t("intelia:cancelWithDependents.cancelFirst")}
            </Button>
          ) : (
            !unresolved && (
              <Button
                variant="destructive"
                size="sm"
                disabled={isPending}
                onClick={() => void handleDelete()}
              >
                {isPending
                  ? t("common:actions.deleting")
                  : t("tasks:delete.action")}
              </Button>
            )
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
