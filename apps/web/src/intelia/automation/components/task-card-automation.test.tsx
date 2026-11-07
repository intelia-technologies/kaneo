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
        "intelia:automation.card.automatica": "Automatic",
        "intelia:automation.card.manual": "Manual",
        "intelia:automation.card.entrega.pr": "PR",
        "intelia:automation.card.entrega.sin_pr": "No PR",
      };
      const templates: Record<string, (o: Record<string, string>) => string> = {
        "intelia:automation.card.paused": (o) => `Paused: ${o.motivo}`,
        "intelia:automation.card.responsable": (o) => `Resp. ${o.id}`,
        "intelia:automation.card.implementador": (o) => `Impl. ${o.id}`,
        "intelia:automation.card.verificador": (o) => `Verif. ${o.id}`,
        "intelia:automation.card.columnaPrevia": (o) => `From: ${o.slug}`,
      };
      if (templates[key] && options) return templates[key](options);
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
  fields: Partial<TaskAutomation> = {},
): readonly [string, TaskAutomation] {
  return [
    taskId,
    {
      taskId,
      level: "arranque",
      verification: true,
      automatica: true,
      pausaMotivo: null,
      entrega: null,
      responsable: null,
      implementador: null,
      verificador: null,
      columnaPrevia: null,
      source: "session",
      setByUserId: null,
      setByName: null,
      setByActor: null,
      setAt: "2026-11-06T00:00:00.000Z",
      ...fields,
    } as TaskAutomation,
  ] as const;
}

function renderCard(fields: Partial<TaskAutomation> = {}) {
  mocks.project.mockReturnValue({
    data: new Map([automation("task-1", fields)]),
  });
  return render(
    <TaskCardAutomation task={{ id: "task-1", projectId: "p1" }} />,
  );
}

describe("TaskCardAutomation", () => {
  it.each([
    ["completa", true, "Completa", "Verification"],
    ["manual", false, "Manual", "No verification"],
  ] as const)(
    "reads %s with verification %s in words",
    (level, verification, levelText, verificationText) => {
      const { container } = renderCard({
        level,
        verification,
        automatica: level !== "manual",
      });

      const badge = container.querySelector("[data-automation-level]");
      expect(badge).toHaveTextContent(levelText);
      expect(screen.getByText(verificationText)).toBeInTheDocument();
      expect(mocks.project).toHaveBeenCalledWith("p1");
    },
  );

  it.each([
    [true, "Automatic"],
    [false, "Manual"],
  ] as const)("reads automatica %s as %s", (automatica, text) => {
    const { container } = renderCard({
      automatica,
      level: automatica ? "arranque" : "manual",
    });

    const marker = container.querySelector(
      `[data-automation-automatica="${automatica}"]`,
    );
    expect(marker).toHaveTextContent(text);
  });

  it("shows the pause chip with its motivo when paused", () => {
    const { container } = renderCard({
      automatica: false,
      level: "manual",
      pausaMotivo: "Pausa del 06-nov",
    });

    const chip = container.querySelector("[data-automation-paused]");
    expect(chip).toHaveTextContent("Paused: Pausa del 06-nov");
    expect(chip).toHaveAttribute("title", "Paused: Pausa del 06-nov");
  });

  it("shows no pause chip without a motivo", () => {
    const { container } = renderCard({ automatica: false, level: "manual" });

    expect(container.querySelector("[data-automation-paused]")).toBeNull();
    expect(screen.queryByText(/Paused/)).not.toBeInTheDocument();
  });

  it.each([
    ["pr", "PR"],
    ["sin_pr", "No PR"],
  ] as const)("reads entrega %s as %s", (entrega, text) => {
    renderCard({ entrega });

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("shows the roles and the previous column when set", () => {
    const { container } = renderCard({
      responsable: "agent:forja",
      implementador: "agent:coder-x",
      verificador: "person:jaime",
      columnaPrevia: "in-review",
    });

    expect(screen.getByText("Resp. agent:forja")).toBeInTheDocument();
    expect(screen.getByText("Impl. agent:coder-x")).toBeInTheDocument();
    expect(screen.getByText("Verif. person:jaime")).toBeInTheDocument();
    expect(screen.getByText("From: in-review")).toBeInTheDocument();
    expect(container.querySelector("[data-automation-roles]")).toHaveAttribute(
      "title",
      "Resp. agent:forja · Impl. agent:coder-x · Verif. person:jaime",
    );
  });

  it("shows only the roles that are set", () => {
    renderCard({ implementador: "agent:coder-x" });

    expect(screen.getByText("Impl. agent:coder-x")).toBeInTheDocument();
    expect(screen.queryByText(/Resp\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/Verif\./)).not.toBeInTheDocument();
  });

  it("shows nothing for null fields", () => {
    const { container } = renderCard();

    expect(container.querySelector("[data-automation-entrega]")).toBeNull();
    expect(container.querySelector("[data-automation-roles]")).toBeNull();
    expect(
      container.querySelector("[data-automation-columna-previa]"),
    ).toBeNull();
    expect(container.querySelector("[data-automation-paused]")).toBeNull();
    expect(screen.queryByText(/PR$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/From:/)).not.toBeInTheDocument();
  });

  it("shows nothing for a task without a row", () => {
    mocks.project.mockReturnValue({
      data: new Map([automation("other")]),
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
