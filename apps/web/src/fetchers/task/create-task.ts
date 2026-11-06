import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

type CreateTaskJson = InferRequestType<
  (typeof client)["task"][":projectId"]["$post"]
>["json"];

export type CreateTaskRequest = CreateTaskJson &
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
  initiative: CreateTaskRequest["initiative"],
  type: CreateTaskRequest["type"],
  validationInProduction: CreateTaskRequest["validationInProduction"],
  validationInProductionReason: CreateTaskRequest["validationInProductionReason"],
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
      initiative,
      type,
      validationInProduction,
      validationInProductionReason,
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
