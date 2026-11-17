import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ScopePause } from "../api";
import { indexPauses } from "../pause-index";
import {
  initEnglish,
  initiativePause,
  projectPause,
} from "../sample.test-data";
import { TaskCardScopePauses } from "./task-card-scope-pauses";

const mocks = vi.hoisted(() => ({ pauses: vi.fn() }));

vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "ws" } }),
}));
vi.mock("../api", () => ({
  useActiveScopePauses: (workspaceId: string) => mocks.pauses(workspaceId),
}));

initEnglish();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderCard(task: { id: string; projectId: string }, ...pauses: ScopePause[]) {
  mocks.pauses.mockReturnValue({ data: indexPauses(pauses) });
  return render(<TaskCardScopePauses task={task} />);
}

const chips = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-scope-pause]")].map((chip) => ({
    scope: chip.getAttribute("data-scope-pause"),
    text: chip.textContent,
    title: chip.getAttribute("title"),
  }));

describe("TaskCardScopePauses", () => {
  it("shows the initiative's chip on its task in another project's board", () => {
    // The initiative lives in SF; KF-15 is on the KF board.
    const { container } = renderCard(
      { id: "task-kf-15", projectId: "p-kf" },
      projectPause(),
      initiativePause(),
    );

    expect(chips(container)).toEqual([
      {
        scope: "initiative",
        text: "Initiative paused: Pausa por iniciativa o proyecto",
        title:
          "Initiative paused: «Pausa por iniciativa o proyecto». Paused by Dédalo: Reordenando el plan. Review on Nov 24, 2026.",
      },
    ]);
    expect(mocks.pauses).toHaveBeenCalledWith("ws");
  });

  it("shows both chips on a task covered by both pauses, the project's first", () => {
    const { container } = renderCard(
      { id: "task-sf-2491", projectId: "p-sf" },
      initiativePause(),
      projectPause(),
    );

    expect(chips(container).map(({ scope, text }) => [scope, text])).toEqual([
      ["project", "Project paused"],
      ["initiative", "Initiative paused: Pausa por iniciativa o proyecto"],
    ]);
    expect(chips(container)[0]?.title).toBe(
      "Project paused: «Software Factory». Paused by agent:forja: Esperando la decisión de Jaime sobre el alcance. Review on Nov 20, 2026.",
    );
  });

  it("shows nothing on a task no pause covers", () => {
    const { container } = renderCard(
      { id: "task-other", projectId: "p-kf" },
      projectPause(),
      initiativePause(),
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing while the pauses load", () => {
    mocks.pauses.mockReturnValue({ data: undefined });
    const { container } = render(
      <TaskCardScopePauses task={{ id: "task-kf-15", projectId: "p-sf" }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
