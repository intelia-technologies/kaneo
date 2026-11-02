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
  getTaskAutomation: vi.fn(),
  getTaskInitiative: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./i18n", () => ({}));
vi.mock("./api", () => ({
  getTaskAutomation: mocks.getTaskAutomation,
  taskAutomationKey: (taskId: string) => ["intelia-automation", "task", taskId],
}));
vi.mock("@/intelia/initiatives/api", () => ({
  getTaskInitiative: mocks.getTaskInitiative,
  taskInitiativeKey: (taskId: string) => ["intelia-initiative", "task", taskId],
}));
vi.mock("@/intelia/initiatives/i18n", () => ({}));
vi.mock("@/hooks/mutations/task/use-duplicate-task", () => ({
  useDuplicateTask: () => ({ mutate: mocks.mutate }),
}));
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
  it("duplicates right away, without asking, when the task has a level and initiative", async () => {
    mocks.getTaskAutomation.mockResolvedValue({
      taskId: "task-1",
      level: "arranque",
      verification: false,
    });

    await duplicate();

    expect(mocks.mutate).toHaveBeenCalledWith(request);
    expect(useDuplicateAutomationStore.getState().request).toBeNull();
  });

  it("asks for a level instead of duplicating when the task has no level", async () => {
    mocks.getTaskAutomation.mockResolvedValue(null);

    await duplicate();

    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(useDuplicateAutomationStore.getState().request).toEqual(
      expect.objectContaining({
        missingAutomation: true,
        missingInitiative: false,
      }),
    );
  });

  it("asks for an initiative instead of duplicating when the task has no initiative", async () => {
    mocks.getTaskAutomation.mockResolvedValue({
      taskId: "task-1",
      level: "arranque",
      verification: false,
    });
    mocks.getTaskInitiative.mockResolvedValue(null);

    await duplicate();

    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(useDuplicateAutomationStore.getState().request).toEqual(
      expect.objectContaining({
        missingAutomation: false,
        missingInitiative: true,
      }),
    );
  });

  it("neither duplicates nor asks when the level cannot be read", async () => {
    mocks.getTaskAutomation.mockRejectedValue(new Error("offline"));

    await duplicate();

    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(useDuplicateAutomationStore.getState().request).toBeNull();
    expect(toast.error).toHaveBeenCalledWith("intelia:automation.loadError");
  });
});
