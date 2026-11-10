import type { InitiativeTask } from "../api";

// How a task came into its initiative (design 19 §3): while the plan was
// open, after it closed, or from before initiatives existed.
export type TaskOrigin = InitiativeTask["origin"];

export const TASK_ORIGINS: readonly TaskOrigin[] = [
  "plan",
  "añadido",
  "sin_registro",
];

/** Each task of the initiative, by id, with its origin. */
export type TaskOrigins = ReadonlyMap<string, TaskOrigin>;

// A task outside the map is not in the initiative and has no origin.
export function matchesOriginFilter(
  selected: readonly string[],
  origin: TaskOrigin | undefined,
): boolean {
  return origin !== undefined && selected.includes(origin);
}
