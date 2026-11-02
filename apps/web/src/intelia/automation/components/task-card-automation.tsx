import type Task from "@/types/task";
import { useProjectAutomation } from "../api";
import { AutomationBadge } from "./automation-badge";

// Every card reads the project's shared query: the request is deduplicated
// (one per project) and a task without a level shows nothing.
export function TaskCardAutomation({
  task,
}: {
  task: Pick<Task, "id" | "projectId">;
}) {
  const { data } = useProjectAutomation(task.projectId);
  const automation = data?.get(task.id);
  if (!automation) return null;

  return (
    <div className="mt-2">
      <AutomationBadge
        level={automation.level}
        verification={automation.verification}
      />
    </div>
  );
}
