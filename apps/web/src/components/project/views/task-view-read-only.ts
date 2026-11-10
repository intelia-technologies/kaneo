import { createContext, useContext } from "react";

// A read-only task view (the initiative's «Tareas» tab, design 19 annex §2)
// shows the board's cards and rows but cannot reorder, select several or act
// on whole columns: a click only opens the task.
export const TaskViewReadOnlyContext = createContext(false);

export function useTaskViewReadOnly() {
  return useContext(TaskViewReadOnlyContext);
}
