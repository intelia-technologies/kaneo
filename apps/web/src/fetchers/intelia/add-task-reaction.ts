import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { Reaction } from "@/types/reaction";

export type AddTaskReactionParams = {
  taskId: string;
  emoji: string;
  externalUserName?: string;
};

export async function addTaskReaction({
  taskId,
  emoji,
  externalUserName,
}: AddTaskReactionParams): Promise<Reaction> {
  const response = await client.intelia.task[":id"].reactions.$post({
    param: { id: taskId },
    json: {
      emoji,
      ...(externalUserName ? { externalUserName } : {}),
    },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  return data as Reaction;
}

export default addTaskReaction;
