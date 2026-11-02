import { client } from "@kaneo/libs";
import type { AutomationInput } from "@/intelia/automation/api";
import { HttpError } from "@/lib/http-error";

async function duplicateTask({
  taskId,
  title,
  automation,
  initiativeId,
}: {
  taskId: string;
  title?: string;
  automation?: AutomationInput;
  initiativeId?: string;
}) {
  const response = await client.task.duplicate[":id"].$post({
    param: { id: taskId },
    json: { title, automation, initiativeId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();

  return data;
}

export default duplicateTask;
