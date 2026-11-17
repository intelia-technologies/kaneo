import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  initEnglish,
  initiativePause,
  pauseChange,
  projectPause,
} from "../sample.test-data";
import { ScopePauseLog } from "./scope-pause-log";

const mocks = vi.hoisted(() => ({ all: vi.fn(), history: vi.fn() }));

vi.mock("../api", () => ({
  useAllScopePauses: (workspaceId: string, enabled: boolean) =>
    mocks.all(workspaceId, enabled),
  useScopePauseHistory: (pauseId: string) => mocks.history(pauseId),
}));

initEnglish();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// A project paused and resumed: nothing active, so the board shows no notice.
const resumed = projectPause({
  id: "pause-old",
  resumedAt: "2026-11-17T10:00:00.000Z",
  resumedByName: "Jaime",
  notaReanudar: "Decidido",
});
const history = {
  "pause-old": [
    pauseChange({
      id: "c1",
      pauseId: "pause-old",
      kind: "created",
      value: { motivo: "Primera razón", revisarEl: "2026-11-18" },
      createdAt: "2026-11-17T08:00:00.000Z",
    }),
    pauseChange({
      id: "c2",
      pauseId: "pause-old",
      kind: "updated",
      previous: { revisarEl: "2026-11-18" },
      value: { revisarEl: "2026-11-20" },
      userName: "Jaime",
      actor: null,
      source: "session",
      createdAt: "2026-11-17T09:00:00.000Z",
    }),
    pauseChange({
      id: "c3",
      pauseId: "pause-old",
      kind: "resumed",
      previous: { resumedAt: null },
      value: {
        resumedAt: "2026-11-17T10:00:00.000Z",
        notaReanudar: "Decidido",
      },
      userName: "Jaime",
      actor: null,
      source: "session",
      createdAt: "2026-11-17T10:00:00.000Z",
    }),
  ],
  "pause-now": [
    pauseChange({
      id: "c4",
      pauseId: "pause-now",
      kind: "created",
      value: { motivo: "Otra vez", revisarEl: "2026-11-25" },
      createdAt: "2026-11-18T08:00:00.000Z",
    }),
  ],
};

function openLog(scope: Parameters<typeof ScopePauseLog>[0]["scope"]) {
  render(<ScopePauseLog workspaceId="ws" scope={scope} />);
  fireEvent.click(screen.getByRole("button", { name: "Pause history" }));
}

describe("ScopePauseLog", () => {
  it("reads the pauses only once opened", () => {
    mocks.all.mockReturnValue({ data: undefined, isLoading: false });

    render(
      <ScopePauseLog
        workspaceId="ws"
        scope={{ type: "project", projectId: "p-sf" }}
      />,
    );

    expect(mocks.all).toHaveBeenLastCalledWith("ws", false);
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it("keeps a resumed pause's history, its resumption included, with no pause active", () => {
    mocks.all.mockReturnValue({
      data: [resumed, initiativePause()],
      isLoading: false,
      isError: false,
    });
    mocks.history.mockImplementation((pauseId: keyof typeof history) => ({
      data: history[pauseId],
      isLoading: false,
      isError: false,
    }));

    openLog({ type: "project", projectId: "p-sf" });

    expect(mocks.all).toHaveBeenLastCalledWith("ws", true);
    // The initiative's pause, though its home is this project, is not listed.
    const pauses = document.querySelectorAll("[data-scope-pause-log]");
    expect(pauses).toHaveLength(1);
    expect(mocks.history).not.toHaveBeenCalledWith("pause-initiative");
    const changes = [
      ...(pauses[0] as HTMLElement).querySelectorAll(
        "[data-scope-pause-change]",
      ),
    ].map((item) => item.textContent);
    expect(changes).toEqual([
      expect.stringMatching(
        /^Pausedagent:forjaAPI key.*Reason:Primera razónReview on:Nov 18, 2026$/,
      ),
      expect.stringMatching(
        /^ChangedJaime.*Review on:Nov 18, 2026→Nov 20, 2026$/,
      ),
      expect.stringMatching(/^ResumedJaime.*Note:Decidido$/),
    ]);
    expect(pauses[0]).toHaveAttribute("data-scope-pause-log", "resumed");
    expect(
      within(pauses[0] as HTMLElement).getByText(/^Paused from .* to /),
    ).toBeInTheDocument();
  });

  it("lists every pause of the scope in order, the active one last", () => {
    mocks.all.mockReturnValue({
      data: [resumed, projectPause({ id: "pause-now" })],
      isLoading: false,
      isError: false,
    });
    mocks.history.mockImplementation((pauseId: keyof typeof history) => ({
      data: history[pauseId],
      isLoading: false,
      isError: false,
    }));

    openLog({ type: "project", projectId: "p-sf" });

    expect(
      [...document.querySelectorAll("[data-scope-pause-log]")].map((item) =>
        item.getAttribute("data-scope-pause-log"),
      ),
    ).toEqual(["resumed", "active"]);
    expect(screen.getByText(/^Paused since /)).toBeInTheDocument();
  });

  it("lists an initiative's pauses on the initiative", () => {
    mocks.all.mockReturnValue({
      data: [resumed, initiativePause({ id: "pause-now" })],
      isLoading: false,
      isError: false,
    });
    mocks.history.mockImplementation((pauseId: keyof typeof history) => ({
      data: history[pauseId],
      isLoading: false,
      isError: false,
    }));

    openLog({ type: "initiative", initiativeId: "ini-81" });

    expect(document.querySelectorAll("[data-scope-pause-log]")).toHaveLength(1);
    expect(mocks.history).toHaveBeenCalledWith("pause-now");
    expect(mocks.history).not.toHaveBeenCalledWith("pause-old");
  });

  it("says so when the scope was never paused", () => {
    mocks.all.mockReturnValue({
      data: [initiativePause()],
      isLoading: false,
      isError: false,
    });

    openLog({ type: "project", projectId: "p-sf" });

    expect(screen.getByText("Never paused")).toBeInTheDocument();
  });
});
