import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ScopePause } from "../api";
import { indexPauses } from "../pause-index";
import {
  initEnglish,
  initiativePause,
  projectPause,
} from "../sample.test-data";
import { InitiativePauseNotice } from "./initiative-pause-notice";
import { ProjectPauseNotice } from "./project-pause-notice";

const mocks = vi.hoisted(() => ({ pauses: vi.fn() }));

vi.mock("../api", () => ({
  useActiveScopePauses: (workspaceId: string) => mocks.pauses(workspaceId),
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

    const notice = screen.getByRole("region", {
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

    expect(screen.getByRole("region")).toHaveTextContent("Paused by Jaime on");
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
});

describe("InitiativePauseNotice", () => {
  it("shows the initiative's pause on the initiative", () => {
    withPauses(projectPause({ projectId: "p-other" }), initiativePause());

    render(<InitiativePauseNotice workspaceId="ws" initiativeId="ini-81" />);

    const notice = screen.getByRole("region", {
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
