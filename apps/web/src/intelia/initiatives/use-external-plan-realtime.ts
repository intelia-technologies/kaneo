import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getWsUrl } from "@/hooks/use-project-websocket";
import { authClient } from "@/lib/auth-client";
import { projectRelationsKey } from "@/intelia/dependencies/api";
import { projectInitiativesRootKey, type InitiativePlan } from "./api";

// The project's socket does not receive changes from another project's tasks.
export function useExternalPlanRealtime(plan: InitiativePlan | undefined) {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const projectId = plan?.projectId;
  const initiativeId = plan?.initiativeId;
  const projects = JSON.stringify(
    [
      ...new Set(
        plan?.tasks
          .filter((task) => task.external && task.projectId !== projectId)
          .map((task) => task.projectId) ?? [],
      ),
    ].sort(),
  );
  useEffect(() => {
    if (!projectId || !initiativeId || !session?.user?.id) return;
    let disposed = false;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    const cleanups: (() => void)[] = [];
    const invalidate = () => {
      void queryClient.invalidateQueries({
        queryKey: projectInitiativesRootKey(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: projectRelationsKey(projectId),
      });
    };
    for (const externalProject of JSON.parse(projects) as string[]) {
      let socket: WebSocket;
      let retry: ReturnType<typeof setTimeout> | undefined;
      let ping: ReturnType<typeof setInterval> | undefined;
      let attempts = 0;
      const connect = () => {
        if (disposed) return;
        socket = new WebSocket(getWsUrl(externalProject));
        socket.onopen = () => {
          if (disposed) return;
          invalidate();
          attempts = 0;
          ping = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN)
              socket.send(JSON.stringify({ type: "ping" }));
          }, 30_000);
        };
        socket.onmessage = (event) => {
          if (disposed) return;
          try {
            const { type } = JSON.parse(event.data);
            if (
              ![
                "TASK_CREATED",
                "TASK_UPDATED",
                "TASK_DELETED",
                "TASK_MOVED",
                "TASK_RELATION_UPDATED",
              ].includes(type)
            )
              return;
            if (!refresh)
              refresh = setTimeout(() => {
                refresh = undefined;
                invalidate();
              }, 5_000);
          } catch {
            /* Ignore malformed socket messages. */
          }
        };
        socket.onclose = (event) => {
          clearInterval(ping);
          if (disposed) return;
          if (event.code === 1008) {
            if (event.reason === "Workspace access revoked")
              queryClient.clear();
            else {
              void queryClient.resetQueries({
                queryKey: projectInitiativesRootKey(projectId),
              });
              void queryClient.resetQueries({
                queryKey: projectRelationsKey(projectId),
              });
            }
            return;
          }
          retry = setTimeout(
            connect,
            Math.min(30_000, 1_000 * 2 ** attempts++),
          );
        };
      };
      connect();
      cleanups.push(() => {
        clearTimeout(retry);
        clearInterval(ping);
        socket.close();
      });
    }
    return () => {
      disposed = true;
      clearTimeout(refresh);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [
    projectId,
    initiativeId,
    projects,
    queryClient,
    session?.user?.id,
    session?.session?.id,
  ]);
}
