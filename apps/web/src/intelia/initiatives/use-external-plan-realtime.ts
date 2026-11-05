import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getWsUrl } from "@/hooks/use-project-websocket";
import { authClient } from "@/lib/auth-client";
import { projectRelationsKey } from "@/intelia/dependencies/api";
import { projectInitiativesRootKey, type InitiativePlan } from "./api";

const denied = new Map<string, number>();

// The project's socket does not receive changes from another project's tasks.
export function useExternalPlanRealtime(plan: InitiativePlan | undefined) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState<Map<string, object>>(
    () => new Map(),
  );
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
  const generation = useMemo(
    () => ({}),
    [
      projectId,
      initiativeId,
      projects,
      session?.user?.id,
      session?.session?.id,
    ],
  );
  useEffect(() => {
    if (!projectId || !initiativeId || !session?.user?.id) return;
    let disposed = false;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    const cleanups: (() => void)[] = [];
    const invalidate = () =>
      Promise.all([
        queryClient.invalidateQueries(
          { queryKey: projectInitiativesRootKey(projectId) },
          { throwOnError: true },
        ),
        queryClient.invalidateQueries(
          { queryKey: projectRelationsKey(projectId) },
          { throwOnError: true },
        ),
      ]);
    for (const externalProject of JSON.parse(projects) as string[]) {
      const deniedKey = `${session.session?.id ?? session.user.id}:${externalProject}`;
      let socket: WebSocket | undefined;
      let retry: ReturnType<typeof setTimeout> | undefined;
      let ping: ReturnType<typeof setInterval> | undefined;
      let attempts = 0;
      const connect = () => {
        if (disposed) return;
        const delay = (denied.get(deniedKey) ?? 0) - Date.now();
        if (delay > 0) {
          retry = setTimeout(connect, delay);
          return;
        }
        denied.delete(deniedKey);
        socket = new WebSocket(getWsUrl(externalProject));
        const current = socket;
        socket.onopen = () => {
          if (disposed) return;
          void invalidate()
            .then(() => {
              if (
                !disposed &&
                current === socket &&
                current.readyState === WebSocket.OPEN
              )
                setConnected((previous) =>
                  new Map(previous).set(externalProject, generation),
                );
            })
            .catch(() => {
              if (!disposed && current === socket) current.close();
            });
          attempts = 0;
          ping = setInterval(() => {
            if (current.readyState === WebSocket.OPEN)
              current.send(JSON.stringify({ type: "ping" }));
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
                void invalidate().catch(() => {
                  if (!disposed && current === socket) current.close();
                });
              }, 5_000);
          } catch {
            /* Ignore malformed socket messages. */
          }
        };
        socket.onclose = (event) => {
          clearInterval(ping);
          if (disposed) return;
          setConnected((previous) => {
            const next = new Map(previous);
            if (next.get(externalProject) === generation)
              next.delete(externalProject);
            return next;
          });
          if (
            event.code === 1008 &&
            event.reason === "Workspace access revoked"
          ) {
            denied.set(deniedKey, Date.now() + 30_000);
            queryClient.clear();
            return;
          }
          if (
            event.code === 1008 &&
            event.reason === "Project access revoked"
          ) {
            denied.set(deniedKey, Date.now() + 30_000);
            void queryClient.resetQueries({
              queryKey: projectInitiativesRootKey(projectId),
            });
            void queryClient.resetQueries({
              queryKey: projectRelationsKey(projectId),
            });
            retry = setTimeout(connect, 30_000);
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
        socket?.close();
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
    generation,
    queryClient,
    session?.user?.id,
    session?.session?.id,
  ]);
  return (JSON.parse(projects) as string[]).some(
    (id) => !session?.user?.id || connected.get(id) !== generation,
  );
}
