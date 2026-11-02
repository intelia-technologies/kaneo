import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type CreateTaskRequest = InferRequestType<
  (typeof client)["task"][":projectId"]["$post"]
>["json"] &
  InferRequestType<(typeof client)["task"][":projectId"]["$post"]>["param"];

// Intelia fork: the API requires `automation` (README-INTELIA.md, «Nivel de
// automatización de las tareas»). The creation form and the subtask input do
// not ask for it yet (AU-12), so it stays optional here and a create without
// it fails before the request.
export type CreateTaskInput = Omit<CreateTaskRequest, "automation"> &
  Partial<Pick<CreateTaskRequest, "automation">>;

async function createTask(
  title: string,
  description: string,
  projectId: string,
  userId: string | undefined,
  status: string,
  startDate: Date | undefined,
  dueDate: Date | undefined,
  priority: CreateTaskRequest["priority"],
  customFields?: { fieldId: string; value: string }[],
  draftAssetIds?: string[],
  recurrence?: CreateTaskRequest["recurrence"],
  automation?: CreateTaskRequest["automation"],
) {
  if (!projectId) {
    throw new Error("No project selected for task creation");
  }
  if (!automation) {
    throw new Error("Choose the task's automation level and verification");
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
