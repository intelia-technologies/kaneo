import { ApiError } from "../../errors/api-error";

/** 409 `TASK_NOT_CLOSED`: only tasks in a final column can be archived. */
export function taskNotClosedError(open: { id: string; status: string }[]) {
  return new ApiError(409, {
    code: "TASK_NOT_CLOSED",
    message: `Only tasks in a final column can be archived; nothing was archived. Open: ${open
      .map((row) => `${row.id} (${row.status})`)
      .join(", ")}`,
  });
}
