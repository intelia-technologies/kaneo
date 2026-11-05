import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * A full task link names the task's project. Once the task moves to another
 * project (Intelia fork, task move with alias), an old link still names the
 * project it left, which may even be archived: send it, without a new history
 * entry, to the same task in the project it is in now. Returns true while
 * that redirect is pending, so the page does not render the task against the
 * wrong project meanwhile.
 */
export function useMovedTaskRedirect({
  workspaceId,
  projectId,
  taskId,
  taskProjectId,
}: {
  workspaceId: string;
  projectId: string;
  taskId: string;
  taskProjectId: string | undefined;
}): boolean {
  const navigate = useNavigate();
  const moved = !!taskProjectId && taskProjectId !== projectId;

  useEffect(() => {
    if (!moved || !taskProjectId) return;
    void navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
      params: { workspaceId, projectId: taskProjectId, taskId },
      replace: true,
    });
  }, [moved, navigate, workspaceId, taskProjectId, taskId]);

  return moved;
}
