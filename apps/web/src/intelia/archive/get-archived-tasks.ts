import { client } from "@kaneo/libs";
import { loadBoardPages } from "@/fetchers/task/load-board-pages";
import { HttpError } from "@/lib/http-error";

/**
 * The project's archived tasks (the mark, plus upstream's old `archived`
 * status), which the board leaves out by default: they come in the
 * `archivedTasks` bucket of `archived=only`.
 */
export async function getArchivedTasks(
  projectId: string,
  signal?: AbortSignal,
) {
  const board = await loadBoardPages(async (page, relatedPage) => {
    const response = await client.task.tasks[":projectId"].$get(
      {
        param: { projectId },
        query: {
          archived: "only",
          page: String(page),
          limit: "100",
          ...(relatedPage ? { relatedPage: String(relatedPage) } : {}),
        },
      },
      { init: { signal } },
    );
    if (!response.ok)
      throw new HttpError(response.status, "Failed to fetch archived tasks");
    return response.json();
  }, signal);
  return board.archivedTasks;
}
