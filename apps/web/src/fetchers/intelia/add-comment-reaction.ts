import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { Reaction } from "@/types/reaction";

export type AddCommentReactionParams = {
  commentId: string;
  emoji: string;
  externalUserName?: string;
};

export async function addCommentReaction({
  commentId,
  emoji,
  externalUserName,
}: AddCommentReactionParams): Promise<Reaction> {
  const response = await client.intelia.comment[":id"].reactions.$post({
    param: { id: commentId },
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

export default addCommentReaction;
