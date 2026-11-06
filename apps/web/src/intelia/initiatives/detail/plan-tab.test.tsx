import { cleanup, render, screen } from "@testing-library/react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { formatDateTime } from "@/lib/format";
import type { InitiativeDetail, InitiativePlan } from "../api";
import { PlanTab } from "./plan-tab";
vi.mock("../use-external-plan-realtime", () => ({
  useExternalPlanRealtime: () => {},
}));

if (!i18n.isInitialized) {
  await i18n.use(initReactI18next).init({
    lng: "es",
    fallbackLng: "es",
    interpolation: { escapeValue: false },
    resources: {},
  });
} else {
  await i18n.changeLanguage("es");
}
// Register the bundle after initializing the isolated test i18n instance.
await import("./i18n");

beforeEach(async () => {
  await i18n.changeLanguage("es");
});
afterEach(cleanup);

const task: InitiativePlan["tasks"][number] = {
  id: "one",
  number: 1,
  title: "Evaluador",
  status: "in-progress",
  statusSince: "2026-11-04T09:00:00Z",
  external: false,
  projectId: "project",
  assignee: null,
  plain: "Compara los resultados",
  actualStart: "2026-11-04T09:00:00Z",
  actualEnd: null,
  workedHours: 2,
  estimate: { hours: 6, source: "manual", cases: 0 },
  remainingHours: 4,
  plannedStart: "2026-11-04T11:00:00Z",
  plannedEnd: "2026-11-04T15:00:00Z",
  critical: true,
  mark: "blocked",
  stallReason: null,
  blockReason: "Permisos",
  blockReasonDetail: "Falta acceso",
  dependsOn: [],
};
const plan: InitiativePlan = {
  initiativeId: "initiative",
  projectId: "project",
  projectScope: null,
  name: "Plan",
  computedAt: "2026-11-04T11:00:00Z",
  estimatesComputedAt: "2026-11-04T11:00:00Z",
  estimatedEnd: "2026-11-04T15:00:00Z",
  criticalPath: {
    taskIds: ["one"],
    hours: 4,
    goalTaskId: "one",
    partial: false,
    cycle: false,
    summary: { advancing: 0, blocked: 1, stalled: 0, waiting: 0 },
  },
  tasks: [task],
};
const initiative = {
  hitos_externos: [
    {
      nombre: "PR externa",
      enlace: "https://example.com/pr",
      estado: "pendiente",
      tarea: "one",
    },
  ],
} as InitiativeDetail;

describe("PlanTab", () => {
  it("renders actual and planned bars, critical marks, manual estimates, plain text and milestones", () => {
    render(<PlanTab plan={plan} initiative={initiative} />);
    expect(screen.getByTestId("actual-bar")).toBeTruthy();
    expect(screen.getByTestId("planned-bar")).toBeTruthy();
    expect(screen.getByText(/◆ crítico/)).toBeTruthy();
    expect(screen.getByText(/Bloqueada: Permisos — Falta acceso/)).toBeTruthy();
    expect(screen.getByText(/6 h \(manual\)/)).toBeTruthy();
    expect(screen.getByText("Compara los resultados")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "PR externa" }).getAttribute("href"),
    ).toBe("https://example.com/pr");
  });
  it("starts a resumed forecast after its blockers and uses the column color", () => {
    const waiting = {
      ...task,
      plannedEnd: "2026-11-04T19:00:00Z",
      remainingHours: 2,
    };
    render(
      <PlanTab
        plan={{ ...plan, tasks: [waiting] }}
        initiative={initiative}
        columns={[{ slug: "in-progress", color: "#123456" }]}
      />,
    );
    const bar = screen.getByTestId("planned-bar");
    expect(bar.title).toBe(
      `${formatDateTime("2026-11-04T17:00:00Z")} – ${formatDateTime("2026-11-04T19:00:00Z")}`,
    );
    expect(bar.style.backgroundColor).toBe("rgb(18, 52, 86)");
  });
  it("shows empty, partial and cyclic states", () => {
    render(
      <PlanTab
        plan={{
          ...plan,
          tasks: [],
          criticalPath: { ...plan.criticalPath, partial: true, cycle: true },
        }}
        initiative={initiative}
      />,
    );
    expect(screen.getByText("No hay tareas en este plan")).toBeTruthy();
    expect(screen.getByText(/Camino parcial/)).toBeTruthy();
    expect(screen.getByText(/Ciclo de dependencias/)).toBeTruthy();
  });
  it("renders finished tasks only as actual and does not link unsafe milestone URLs", () => {
    const finished = {
      ...task,
      actualEnd: "2026-11-04T10:00:00Z",
      plannedEnd: "2026-11-04T10:00:00Z",
    };
    const unsafe = {
      hitos_externos: [
        {
          nombre: "Malicioso",
          enlace: "javascript:alert(1)",
          estado: "pendiente",
        },
      ],
    } as InitiativeDetail;
    render(
      <PlanTab plan={{ ...plan, tasks: [finished] }} initiative={unsafe} />,
    );
    expect(screen.getByTestId("actual-bar")).toBeTruthy();
    expect(screen.queryByTestId("planned-bar")).toBeNull();
    expect(screen.getByText(/Malicioso/).closest("a")).toBeNull();
  });
});
