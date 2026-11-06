import { client } from "@kaneo/libs";

import type { AutomationInput } from "@/intelia/automation/api";
import { HttpError } from "@/lib/http-error";
export type TaskToImport = {
  type: "implementacion" | "validacion" | "operacion" | "diseno";
  validationInProduction?: "requerida" | "no_aplica" | null;
  validationInProductionReason?: string | null;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  startDate?: string;
  dueDate?: string;
  userId?: string | null;
};

async function importTasks(
  projectId: string,
  tasks: TaskToImport[],
  automation: AutomationInput,
  initiativeId: string,
) {
  const response = await client.task.import[":projectId"].$post({
    param: { projectId },
    json: { tasks, automation, initiativeId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  return data;
}

export default importTasks;
