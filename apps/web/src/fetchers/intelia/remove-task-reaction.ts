import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { Reaction } from "@/types/reaction";

export type RemoveTaskReactionParams = {
  taskId: string;
  emoji: string;
  externalUserName?: string;
};

export async function removeTaskReaction({
  taskId,
  emoji,
  externalUserName,
}: RemoveTaskReactionParams): Promise<Reaction> {
  const query: { emoji: string; externalUserName?: string } = {
    emoji,
    ...(externalUserName ? { externalUserName } : {}),
  };

  const response = await client.intelia.task[":id"].reactions.$delete({
    param: { id: taskId },
    query,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  return data as Reaction;
}

export default removeTaskReaction;
