import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTaskStatus } from "@/hooks/mutations/task/use-update-task-status";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import { openCancelPanel } from "@/intelia/cancel-with-dependents/entry/cancel-panel-store";
import { dependenciesErrorOf } from "@/intelia/cancel-with-dependents/entry/dependencies-error";
import type Task from "@/types/task";
import { statusMenuOptions } from "./menus/status-menu-options";

type SubtaskStatusPopoverProps = {
  tasks: Task[];
  projectId: string;
  children: React.ReactNode;
};

export default function SubtaskStatusPopover({
  tasks,
  projectId,
  children,
}: SubtaskStatusPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: columns = [] } = useGetColumns(projectId);
  const { mutateAsync: updateTaskStatus } = useUpdateTaskStatus();
  const { canUpdateTasks } = useWorkspacePermission();

  if (!canUpdateTasks()) return <>{children}</>;

  const current = tasks.every((task) => task.status === tasks[0]?.status)
    ? tasks[0]?.status
    : undefined;

  const changeStatus = async (status: string) => {
    setOpen(false);
    const results = await Promise.allSettled(
      tasks.map((task) => updateTaskStatus({ ...task, status })),
    );
    const failures = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [{ error: result.reason as unknown, taskId: tasks[index]!.id }]
        : [],
    );
    // The first subtask with open dependents opens panel D for itself (the
    // panel takes one root at a time); any other failure is reported once.
    failures.find(({ error, taskId }) => openCancelPanel(error, taskId));
    const other = failures.find(({ error }) => !dependenciesErrorOf(error));
    if (other)
      toast.error(
        other.error instanceof Error
          ? other.error.message
          : t("tasks:popover.status.updateError"),
      );
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <OptionMenu
          label={t("tasks:status.label")}
          placeholder={t("tasks:bulk.statusPlaceholder")}
          options={statusMenuOptions(columns, current)}
          onSelect={changeStatus}
        />
      </PopoverContent>
    </Popover>
  );
}
