import { act, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { InitiativePlan } from "./api";
import { useExternalPlanRealtime } from "./use-external-plan-realtime";

const mocks = vi.hoisted(() => ({ invalidate: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
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
  onclose?: () => void;
  onmessage?: (event: { data: string }) => void;
  readyState = 1;
  constructor(public url: string) {
    Socket.instances.push(this);
  }
  send() {}
  close() {
    this.onclose?.();
  }
}
const plan = {
  projectId: "own",
  initiativeId: "i",
  tasks: [{ external: true, projectId: "other" }],
} as InitiativePlan;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
  Socket.instances = [];
  mocks.invalidate.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("external plan realtime", () => {
  it("refreshes the initiative after external task events and reconnects", () => {
    const { unmount } = renderHook(() => useExternalPlanRealtime(plan));
    expect(Socket.instances[0].url).toBe("ws://localhost/other");
    act(() => {
      Socket.instances[0].onopen?.();
      Socket.instances[0].onmessage?.({
        data: JSON.stringify({ type: "TASK_UPDATED" }),
      });
      vi.advanceTimersByTime(5_000);
    });
    expect(mocks.invalidate).toHaveBeenCalledWith({
      queryKey: ["intelia-initiative", "project", "own", "plan", "i"],
    });
    mocks.invalidate.mockClear();
    act(() => {
      Socket.instances[0].onclose?.();
      vi.advanceTimersByTime(1_000);
      Socket.instances[1].onopen?.();
    });
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
