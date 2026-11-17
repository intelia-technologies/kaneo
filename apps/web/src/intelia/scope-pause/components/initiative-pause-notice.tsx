import { useActiveScopePauses } from "../api";
import { ScopePauseNotice } from "./scope-pause-notice";

export function InitiativePauseNotice({
  workspaceId,
  initiativeId,
}: {
  workspaceId: string;
  initiativeId: string;
}) {
  const { data } = useActiveScopePauses(workspaceId);
  const pause = data?.byInitiative.get(initiativeId);
  if (!pause) return null;

  return <ScopePauseNotice pause={pause} />;
}
