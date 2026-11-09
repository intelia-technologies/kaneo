import { subscribeToEvent } from "../../events";
import { broadcastToProject } from "../../ws";
import { dropArchiveIfReopened, TASKS_ARCHIVED_EVENT } from "./service";

// Every event that can carry a status change (imports use task.updated), as
// the routines and requests do.
for (const eventType of ["task.status_changed", "task.moved", "task.updated"]) {
  subscribeToEvent(eventType, dropArchiveIfReopened);
}

// Archiving moves tasks out of the board: clients refetch it once per project,
// like a bulk unassign, instead of one message per task.
subscribeToEvent<{ projectId: string; initiatorId?: string }>(
  TASKS_ARCHIVED_EVENT,
  async ({ projectId, initiatorId }) => {
    if (!projectId) return;
    broadcastToProject(
      projectId,
      { type: "TASK_UPDATED", projectId, taskId: "" },
      initiatorId,
    );
  },
);
