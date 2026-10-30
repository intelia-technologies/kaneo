import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { Reaction } from "@/types/reaction";

export async function getTaskReactions(taskId: string): Promise<Reaction[]> {
  const response = await client.intelia.task[":id"].reactions.$get({
    param: { id: taskId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  return data as Reaction[];
}

export default getTaskReactions;
