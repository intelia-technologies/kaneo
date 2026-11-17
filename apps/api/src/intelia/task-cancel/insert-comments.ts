import { activityTable } from "../../database/schema";
import type { Transaction } from "../task-automation/service";
import type { CancelComment } from "./comments";

/**
 * Writes the comments of a cancellation inside its transaction: the last step,
 * so a failure here leaves nothing changed. With `firma`, signed as the gateway
 * signs its comments (`externalUserName`).
 */
export function insertComments(
  tx: Transaction,
  comments: CancelComment[],
  userId: string,
  firma: string | undefined,
) {
  if (!comments.length) return Promise.resolve([]);
  return tx
    .insert(activityTable)
    .values(
      comments.map((c) => ({
        taskId: c.taskId,
        type: "comment",
        userId,
        content: c.content,
        ...(firma ? { externalUserName: firma, externalSource: "kaneo" } : {}),
      })),
    )
    .returning();
}
