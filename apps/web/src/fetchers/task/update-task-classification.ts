import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

type Classification = InferRequestType<
  (typeof client)["task"]["classification"][":id"]["$put"]
>["json"];

export default async function updateTaskClassification(
  taskId: string,
  classification: Classification,
) {
  const response = await client.task.classification[":id"].$put({
    param: { id: taskId },
    json: classification,
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
