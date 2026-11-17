import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ScopePause } from "../api";
import { indexPauses } from "../pause-index";
import {
  initEnglish,
  initiativePause,
  pauseChange,
  projectPause,
} from "../sample.test-data";
import { InitiativePauseNotice } from "./initiative-pause-notice";
import { ProjectPauseNotice } from "./project-pause-notice";

const mocks = vi.hoisted(() => ({ pauses: vi.fn(), history: vi.fn() }));

vi.mock("../api", () => ({
  useActiveScopePauses: (workspaceId: string) => mocks.pauses(workspaceId),
  useScopePauseHistory: (pauseId: string) => mocks.history(pauseId),
}));

initEnglish();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function withPauses(...pauses: ScopePause[]) {
  mocks.pauses.mockReturnValue({ data: indexPauses(pauses) });
}

describe("ProjectPauseNotice", () => {
  it("shows who paused the project, the reason and the review date", () => {
    withPauses(projectPause(), initiativePause());

    render(<ProjectPauseNotice workspaceId="ws" projectId="p-sf" />);

    const notice = screen.getByRole("status", {
      name: "This project is paused",
    });
    expect(notice).toHaveTextContent("Paused by agent:forja on");
    expect(notice).toHaveTextContent(
      "Esperando la decisión de Jaime sobre el alcance",
    );
    expect(notice).toHaveTextContent("Review on Nov 20, 2026");
    expect(mocks.pauses).toHaveBeenCalledWith("ws");
  });

  it("names the person when no graph id was declared", () => {
    withPauses(projectPause({ pausedByActor: null, pausedByName: "Jaime" }));

    render(<ProjectPauseNotice workspaceId="ws" projectId="p-sf" />);

    expect(screen.getByRole("status")).toHaveTextContent("Paused by Jaime on");
  });

  it("shows nothing when the project is not paused", () => {
    // An initiative whose home is this project is not a project pause.
    withPauses(projectPause({ projectId: "p-other" }), initiativePause());

    const { container } = render(
      <ProjectPauseNotice workspaceId="ws" projectId="p-sf" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing while the pauses load", () => {
    mocks.pauses.mockReturnValue({ data: undefined });

    const { container } = render(
      <ProjectPauseNotice workspaceId="ws" projectId="p-sf" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("loads the history only when opened, and lists it in order", () => {
    withPauses(projectPause());
    mocks.history.mockReturnValue({
      data: [
        pauseChange({
          id: "c1",
          kind: "created",
          value: { motivo: "Primera razón", revisarEl: "2026-11-18" },
          createdAt: "2026-11-17T08:00:00.000Z",
        }),
        pauseChange({
          id: "c2",
          kind: "updated",
          previous: { revisarEl: "2026-11-18" },
          value: { revisarEl: "2026-11-20" },
          userName: "Jaime",
          actor: null,
          source: "session",
          createdAt: "2026-11-17T09:00:00.000Z",
        }),
      ],
      isLoading: false,
      isError: false,
    });

    render(<ProjectPauseNotice workspaceId="ws" projectId="p-sf" />);
    expect(mocks.history).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Pause history/ }));

    expect(mocks.history).toHaveBeenCalledWith("pause-project");
    const items = screen
      .getByRole("list", { name: "Pause history" })
      .querySelectorAll("[data-scope-pause-change]");
    expect([...items].map((item) => item.textContent)).toEqual([
      expect.stringMatching(
        /^Pausedagent:forjaAPI key.*Reason:Primera razónReview on:Nov 18, 2026$/,
      ),
      expect.stringMatching(/^ChangedJaime.*Review on:Nov 18, 2026→Nov 20, 2026$/),
    ]);
  });
});

describe("InitiativePauseNotice", () => {
  it("shows the initiative's pause on the initiative", () => {
    withPauses(projectPause({ projectId: "p-other" }), initiativePause());

    render(<InitiativePauseNotice workspaceId="ws" initiativeId="ini-81" />);

    const notice = screen.getByRole("status", {
      name: "This initiative is paused",
    });
    expect(notice).toHaveTextContent("Paused by Dédalo on");
    expect(notice).toHaveTextContent("Reordenando el plan");
    expect(notice).toHaveTextContent("Review on Nov 24, 2026");
  });

  it("shows nothing for an initiative without a pause", () => {
    withPauses(initiativePause({ initiativeId: "ini-other" }));

    const { container } = render(
      <InitiativePauseNotice workspaceId="ws" initiativeId="ini-81" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
