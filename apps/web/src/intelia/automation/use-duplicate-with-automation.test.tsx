import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { toast } from "@/lib/toast";
import { useDuplicateAutomationStore } from "./duplicate-store";
import { useDuplicateWithAutomation } from "./use-duplicate-with-automation";

const mocks = vi.hoisted(() => ({
  getTaskInitiative: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./i18n", () => ({}));
vi.mock("@/intelia/initiatives/api", () => ({
  getTaskInitiative: mocks.getTaskInitiative,
  taskInitiativeKey: (taskId: string) => ["intelia-initiative", "task", taskId],
}));
vi.mock("@/intelia/initiatives/i18n", () => ({}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));

const request = { taskId: "task-1", title: "Copy of task" };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function duplicate() {
  const { result } = renderHook(() => useDuplicateWithAutomation(), {
    wrapper,
  });
  await act(async () => {
    await result.current(request);
  });
}

beforeEach(() => {
  useDuplicateAutomationStore.getState().close();
  mocks.getTaskInitiative.mockResolvedValue({
    taskId: "task-1",
    initiativeId: "init-1",
    initiativeName: "Core",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useDuplicateWithAutomation", () => {
  it("asks for the automation even when the task has automation and initiative", async () => {
    await duplicate();

    expect(useDuplicateAutomationStore.getState().request).toEqual({
      ...request,
      missingInitiative: false,
    });
  });

  it("also asks for an initiative when the task has none", async () => {
    mocks.getTaskInitiative.mockResolvedValue(null);

    await duplicate();

    expect(useDuplicateAutomationStore.getState().request).toEqual({
      ...request,
      missingInitiative: true,
    });
  });

  it("does not ask when the initiative cannot be read", async () => {
    mocks.getTaskInitiative.mockRejectedValue(new Error("offline"));

    await duplicate();

    expect(useDuplicateAutomationStore.getState().request).toBeNull();
    expect(toast.error).toHaveBeenCalledWith("intelia:automation.loadError");
  });
});
