import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { ReactNode } from "react";
import type { InitiativePlan } from "./api";
import { useExternalPlanRealtime } from "./use-external-plan-realtime";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "u" }, session: { id: "s" } } }),
  },
}));
vi.mock("@/hooks/use-project-websocket", () => ({
  getWsUrl: (id: string) => `ws://localhost/${id}`,
}));
class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  onopen?: () => void;
  onclose?: (event: { code: number; reason: string }) => void;
  onmessage?: (event: { data: string }) => void;
  readyState = 1;
  constructor(public url: string) {
    Socket.instances.push(this);
  }
  send() {}
  close() {
    this.onclose?.({ code: 1000, reason: "" });
  }
}
const plan = {
  projectId: "own",
  initiativeId: "i",
  tasks: [{ external: true, projectId: "other" }],
} as InitiativePlan;
const planKey = ["intelia-initiative", "project", "own", "plan", "i"];
const detailKey = ["intelia-initiative", "project", "own", "detail", "i"];
const relationsKey = ["project-relations", "own"];
let client: QueryClient;
let wrapper: ({ children }: { children: ReactNode }) => ReactNode;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
  Socket.instances = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(planKey, { title: "external secret" });
  client.setQueryData(detailKey, { title: "external secret" });
  client.setQueryData(relationsKey, { title: "external secret" });
  wrapper = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
});
afterEach(() => {
  client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("external plan realtime", () => {
  it("invalidates plan, detail and relations after an external event and after reconnecting", () => {
    const { unmount } = renderHook(() => useExternalPlanRealtime(plan), {
      wrapper,
    });
    expect(Socket.instances[0].url).toBe("ws://localhost/other");
    act(() => {
      Socket.instances[0].onmessage?.({
        data: JSON.stringify({ type: "TASK_UPDATED" }),
      });
      vi.advanceTimersByTime(5_000);
    });
    for (const key of [planKey, detailKey, relationsKey])
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of [planKey, detailKey, relationsKey])
      client.setQueryData(key, { title: "fresh" });
    act(() => {
      Socket.instances[0].onclose?.({ code: 1006, reason: "" });
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
      Socket.instances[1].onopen?.();
    });
    for (const key of [planKey, detailKey, relationsKey])
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    unmount();
  });
  it("removes cached external data on revocation and does not reconnect", () => {
    const revokedPlan = {
      ...plan,
      tasks: [{ external: true, projectId: "revoked" }],
    } as InitiativePlan;
    const { unmount } = renderHook(() => useExternalPlanRealtime(revokedPlan), {
      wrapper,
    });
    act(() => {
      Socket.instances[0].onopen?.();
      Socket.instances[0].onclose?.({
        code: 1008,
        reason: "Project access revoked",
      });
      vi.advanceTimersByTime(60_000);
    });
    for (const key of [planKey, detailKey, relationsKey])
      expect(client.getQueryData(key)).toBeUndefined();
    expect(Socket.instances).toHaveLength(1);
    unmount();
  });
  it("hides the plan throughout an abnormal close and failed reconnect", async () => {
    const { result, unmount } = renderHook(
      () => useExternalPlanRealtime(plan),
      { wrapper },
    );
    expect(result.current).toBe(true);
    await act(async () => {
      Socket.instances[0].onopen?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current).toBe(false);
    act(() => {
      Socket.instances[0].onclose?.({ code: 1006, reason: "" });
    });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1_000);
      Socket.instances[1].onclose?.({ code: 1006, reason: "" });
    });
    expect(result.current).toBe(true);
    unmount();
  });
  it("requires a fresh verification when external projects change away and back", async () => {
    const other = {
      ...plan,
      tasks: [{ external: true, projectId: "third" }],
    } as InitiativePlan;
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useExternalPlanRealtime(value),
      { wrapper, initialProps: { value: plan } },
    );
    await act(async () => {
      Socket.instances[0].onopen?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current).toBe(false);
    rerender({ value: other });
    expect(result.current).toBe(true);
    rerender({ value: plan });
    expect(result.current).toBe(true);
    unmount();
  });
});
