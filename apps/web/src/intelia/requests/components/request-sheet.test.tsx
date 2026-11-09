import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { RequestSheet } from "./request-sheet";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  request: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../i18n", () => ({}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/format", () => ({ formatDateTime: (value: string) => value }));
vi.mock("@/components/ui/sheet", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Sheet: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <>{children}</> : null,
    SheetPopup: Pass,
    SheetPanel: Pass,
    SheetHeader: Pass,
    SheetTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    SheetDescription: Pass,
  };
});
vi.mock("../api", () => ({
  useRequest: () => mocks.request(),
  useCommentRequest: () => ({ mutate: mocks.mutate, isPending: false }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const detail = {
  taskId: "task-1",
  title: "Pedir un informe",
  ticketId: "ALP-1",
  status: "pedida",
  statusName: "Pedida",
  projectId: "project-1",
  projectName: "Alpha",
  requestedAt: "2026-11-09T10:00:00.000Z",
  description: "Para el lunes",
  requester: { userId: "user-1", name: "Ana" },
  comments: [
    {
      id: "c1",
      userId: "user-2",
      userName: "Luis",
      externalUserName: null,
      content: "Lo miramos",
      createdAt: "2026-11-09T11:00:00.000Z",
    },
  ],
};

describe("RequestSheet", () => {
  it("shows the task and its comments, and sends a trimmed comment", () => {
    mocks.request.mockReturnValue({
      data: detail,
      isLoading: false,
      isError: false,
    });
    render(<RequestSheet taskId="task-1" onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "ALP-1Pedir un informe",
    );
    expect(screen.getByText("Alpha · Pedida")).toBeTruthy();
    expect(screen.getByText("Lo miramos")).toBeTruthy();

    const send = screen.getByRole("button", {
      name: "intelia:requests.detail.send",
    }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(
      screen.getByRole("textbox", { name: "intelia:requests.detail.reply" }),
      { target: { value: "  Gracias  " } },
    );
    fireEvent.click(send);
    expect(mocks.mutate).toHaveBeenCalledWith("Gracias", expect.anything());
  });

  it("says the request is gone when it can no longer be read", () => {
    mocks.request.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<RequestSheet taskId="task-1" onClose={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toBe(
      "intelia:requests.detail.loadError",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
