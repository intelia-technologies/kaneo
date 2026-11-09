import { subscribeToEvent } from "../../events";
import { syncTaskRequest } from "./service";

// Every event that can carry a status change (imports use task.updated), as
// the routines do: the request closes in a cancelled column and opens again
// out of it, whichever path moved the task.
for (const eventType of ["task.status_changed", "task.moved", "task.updated"]) {
  subscribeToEvent(eventType, syncTaskRequest);
}
