import { client } from "@kaneo/libs";

import type { AutomationInput } from "@/intelia/automation/api";
import { HttpError } from "@/lib/http-error";
export type TaskToImport = {
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
  // Intelia fork: required by the API (README-INTELIA.md, «Iniciativas»). The
  // import dialog and the starter project do not send it yet (IN-05): without
  // it the API decides, 400 in a deployment and the test default in CI.
  initiativeId?: string,
) {
  const response = await client.task.import[":projectId"].$post({
    param: { projectId },
    json: { tasks, automation, initiativeId: initiativeId as string },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  return data;
}

export default importTasks;
