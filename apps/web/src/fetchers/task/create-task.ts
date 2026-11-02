import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

type CreateTaskJson = InferRequestType<
  (typeof client)["task"][":projectId"]["$post"]
>["json"];

// Intelia fork: the API requires `initiative` (README-INTELIA.md,
// «Iniciativas»). The creation form and the subtask input do not ask for it
// yet (IN-05), so it is not part of the web's request type.
export type CreateTaskRequest = Omit<CreateTaskJson, "initiative"> &
  InferRequestType<(typeof client)["task"][":projectId"]["$post"]>["param"];

export type CreateTaskInput = CreateTaskRequest;

async function createTask(
  title: string,
  description: string,
  projectId: string,
  userId: string | undefined,
  status: string,
  startDate: Date | undefined,
  dueDate: Date | undefined,
  priority: CreateTaskRequest["priority"],
  automation: CreateTaskRequest["automation"],
  customFields?: { fieldId: string; value: string }[],
  draftAssetIds?: string[],
  recurrence?: CreateTaskRequest["recurrence"],
) {
  if (!projectId) {
    throw new Error("No project selected for task creation");
  }

  const response = await client.task[":projectId"].$post({
    json: {
      title,
      description,
      ...(userId ? { userId } : {}),
      status,
      startDate: startDate?.toISOString() || undefined,
      dueDate: dueDate?.toISOString() || undefined,
      priority,
      recurrence,
      customFields,
      draftAssetIds,
      automation,
      // Without an initiative (form and subtasks until IN-05) the field is
      // left out of the JSON and the API decides: 400 in a deployment, the
      // test default in upstream's CI smoke. Only this field skips the type
      // check.
      initiative: undefined as unknown as CreateTaskJson["initiative"],
    },
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();

  return data;
}

export default createTask;
