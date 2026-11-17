import type { ScopePause } from "./api";

export type ScopePauseIndex = {
  byProject: ReadonlyMap<string, ScopePause>;
  byInitiative: ReadonlyMap<string, ScopePause>;
  // Initiative pauses only, by each of the initiative's tasks (in any
  // project): a project pause is found through the task's project.
  byTask: ReadonlyMap<string, readonly ScopePause[]>;
};

export function indexPauses(pauses: readonly ScopePause[]): ScopePauseIndex {
  const byProject = new Map<string, ScopePause>();
  const byInitiative = new Map<string, ScopePause>();
  const byTask = new Map<string, ScopePause[]>();
  for (const pause of pauses) {
    if (pause.initiativeId === null) {
      byProject.set(pause.projectId, pause);
      continue;
    }
    byInitiative.set(pause.initiativeId, pause);
    for (const taskId of pause.taskIds ?? []) {
      const list = byTask.get(taskId);
      if (list) list.push(pause);
      else byTask.set(taskId, [pause]);
    }
  }
  return { byProject, byInitiative, byTask };
}

/** The active pauses covering the task: its project's first, then its initiatives'. */
export function pausesCoveringTask(
  index: ScopePauseIndex,
  task: { id: string; projectId: string },
): ScopePause[] {
  const projectPause = index.byProject.get(task.projectId);
  const initiativePauses = index.byTask.get(task.id) ?? [];
  return projectPause
    ? [projectPause, ...initiativePauses]
    : [...initiativePauses];
}

export type PauseScope =
  | { type: "project"; projectId: string }
  | { type: "initiative"; initiativeId: string };

/** The scope's own pauses, active and resumed, in the list's order. */
export function pausesOfScope(
  pauses: readonly ScopePause[],
  scope: PauseScope,
): ScopePause[] {
  return pauses.filter((pause) =>
    scope.type === "project"
      ? pause.initiativeId === null && pause.projectId === scope.projectId
      : pause.initiativeId === scope.initiativeId,
  );
}
