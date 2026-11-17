import { useActiveScopePauses } from "../api";
import { ScopePauseNotice } from "./scope-pause-notice";

export function ProjectPauseNotice({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const { data } = useActiveScopePauses(workspaceId);
  const pause = data?.byProject.get(projectId);
  if (!pause) return null;

  return <ScopePauseNotice pause={pause} className="mx-2 my-2 sm:mx-3" />;
}
