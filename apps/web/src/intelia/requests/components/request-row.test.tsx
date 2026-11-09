import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { MyRequest } from "../api";
import { RequestRow } from "./request-row";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../i18n", () => ({}));
vi.mock("@/lib/format", () => ({ formatDateTime: (value: string) => value }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const base = {
  taskId: "task-1",
  title: "Pedir un informe",
  ticketId: "ALP-1",
  status: "pedida",
  statusName: "Pedida",
  projectId: "project-1",
  projectName: "Alpha",
  requestedAt: "2026-11-09T10:00:00.000Z",
  state: "open",
  closedAt: null,
  closedReason: null,
  followable: true,
} as unknown as MyRequest;

function renderRow(request: MyRequest, onSelect = vi.fn()) {
  render(
    <table>
      <tbody>
        <RequestRow request={request} onSelect={onSelect} />
      </tbody>
    </table>,
  );
  return onSelect;
}

describe("RequestRow", () => {
  it("opens an open request and shows its column", () => {
    const onSelect = renderRow(base);
    expect(screen.getByText("Pedida")).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("task-1");
  });

  it("shows a rejected request with its reason, and does not open it", () => {
    const onSelect = renderRow({
      ...base,
      status: "cancelled",
      statusName: "Cancelled",
      state: "rejected",
      closedAt: "2026-11-09T11:00:00.000Z",
      closedReason: "No es de este equipo",
      followable: false,
    } as unknown as MyRequest);
    expect(screen.getByText("intelia:requests.state.rejected")).toBeTruthy();
    expect(screen.getByText("No es de este equipo")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByText("Pedir un informe"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows a cancelled request without a reason", () => {
    renderRow({
      ...base,
      status: "cancelled",
      state: "cancelled",
      closedAt: "2026-11-09T11:00:00.000Z",
      followable: false,
    } as unknown as MyRequest);
    expect(screen.getByText("intelia:requests.state.cancelled")).toBeTruthy();
  });
});
