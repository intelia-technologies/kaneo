import { subscribeToEvent } from "../../events";
import { closePlanOnStart } from "./service";

// The plan closes on its own when a task of the initiative reaches In progress
// (design 19 §4): created there, moved there, or reopened there by a routine
// or an integration. Idempotent, so it listens to every event that can carry
// a status change (imports use task.updated).
for (const eventType of [
  "task.created",
  "task.status_changed",
  "task.moved",
  "task.updated",
]) {
  subscribeToEvent(eventType, closePlanOnStart);
}
