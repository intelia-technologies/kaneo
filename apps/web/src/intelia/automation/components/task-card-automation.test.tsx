import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { TaskAutomation } from "../api";
import { TaskCardAutomation } from "./task-card-automation";

const mocks = vi.hoisted(() => ({ project: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const messages: Record<string, string> = {
        "intelia:automation.levels.manual": "Manual",
        "intelia:automation.levels.arranque": "Arranque",
        "intelia:automation.levels.completa": "Completa",
        "intelia:automation.verified": "Verification",
        "intelia:automation.notVerified": "No verification",
      };
      return messages[key] ?? `${key} ${JSON.stringify(options)}`;
    },
  }),
}));
vi.mock("../i18n", () => ({}));
vi.mock("../api", () => ({
  useProjectAutomation: (projectId: string) => mocks.project(projectId),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function automation(
  taskId: string,
  level: TaskAutomation["level"],
  verification: boolean,
) {
  return [taskId, { taskId, level, verification }] as const;
}

describe("TaskCardAutomation", () => {
  it.each([
    ["completa", true, "Completa", "Verification"],
    ["manual", false, "Manual", "No verification"],
  ] as const)(
    "reads %s with verification %s in words",
    (level, verification, levelText, verificationText) => {
      mocks.project.mockReturnValue({
        data: new Map([automation("task-1", level, verification)]),
      });
      render(<TaskCardAutomation task={{ id: "task-1", projectId: "p1" }} />);

      expect(screen.getByText(levelText)).toBeInTheDocument();
      expect(screen.getByText(verificationText)).toBeInTheDocument();
      expect(mocks.project).toHaveBeenCalledWith("p1");
    },
  );

  it("shows nothing for a task without a level", () => {
    mocks.project.mockReturnValue({
      data: new Map([automation("other", "arranque", true)]),
    });
    const { container } = render(
      <TaskCardAutomation task={{ id: "task-1", projectId: "p1" }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing while the project map is loading", () => {
    mocks.project.mockReturnValue({ data: undefined });
    const { container } = render(
      <TaskCardAutomation task={{ id: "task-1", projectId: "p1" }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
