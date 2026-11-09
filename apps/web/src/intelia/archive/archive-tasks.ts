import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// The API takes at most 100 ids per call (design 53 §3.2).
const BATCH = 100;

/**
 * Archives closed tasks: a mark apart from the status, so they stay done or
 * cancelled. Larger selections go in batches of 100; each batch is atomic.
 */
export async function archiveTasks(taskIds: string[]) {
  for (let start = 0; start < taskIds.length; start += BATCH) {
    const response = await client.intelia.tasks.archive.$post({
      json: { taskIds: taskIds.slice(start, start + BATCH) },
    });
    if (!response.ok) throw await HttpError.fromResponse(response);
  }
}
