import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { Reaction } from "@/types/reaction";

export type RemoveCommentReactionParams = {
  commentId: string;
  emoji: string;
  externalUserName?: string;
};

export async function removeCommentReaction({
  commentId,
  emoji,
  externalUserName,
}: RemoveCommentReactionParams): Promise<Reaction> {
  const query: { emoji: string; externalUserName?: string } = {
    emoji,
    ...(externalUserName ? { externalUserName } : {}),
  };

  const response = await client.intelia.comment[":id"].reactions.$delete({
    param: { id: commentId },
    query,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  return data as Reaction;
}

export default removeCommentReaction;
