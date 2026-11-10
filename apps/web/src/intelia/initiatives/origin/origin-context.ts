import { createContext, useContext } from "react";
import type { TaskOrigin, TaskOrigins } from "./origin";

// The origins of the initiative shown by the «Tareas» tab. Cards and rows of
// any other view have none, so they draw no origin chip.
export const TaskOriginsContext = createContext<TaskOrigins | null>(null);

export function useTaskOrigin(taskId: string): TaskOrigin | undefined {
  return useContext(TaskOriginsContext)?.get(taskId);
}
