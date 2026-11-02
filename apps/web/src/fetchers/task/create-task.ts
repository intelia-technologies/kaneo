import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type CreateTaskRequest = InferRequestType<
  (typeof client)["task"][":projectId"]["$post"]
>["json"] &
  InferRequestType<(typeof client)["task"][":projectId"]["$post"]>["param"];

// Intelia fork: the API requires `automation` (README-INTELIA.md, «Nivel de
// automatización de las tareas»). The creation form and the subtask input do
// not ask for it yet (AU-12), so it is optional here.
export type CreateTaskInput = Omit<CreateTaskRequest, "automation"> &
  Partial<Pick<CreateTaskRequest, "automation">>;
type CreateTaskAutomation = InferRequestType<
  (typeof client)["task"][":projectId"]["$post"]
>["json"]["automation"];

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
  automation?: CreateTaskAutomation,
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
      // Without a level (form and subtasks until AU-12) the field is left out
      // of the JSON and the API decides: 400 in a deployment, the test default
      // in upstream's CI smoke. Only this field skips the type check.
      automation: automation as CreateTaskAutomation,
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
