import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { ProjectInitiatives } from "../api";
import { InitiativesPage } from "./initiatives-page";

const mockNavigate = vi.fn();
let isMobileValue = false;

const translations: Record<string, string> = {
  "intelia:initiatives.title": "Iniciativas",
  "intelia:initiatives.loading": "Cargando iniciativas…",
  "intelia:initiatives.loadError": "No se pudieron cargar las iniciativas",
  "intelia:initiatives.retry": "Reintentar",
  "intelia:initiatives.blocked": "{{count}} Blocked",
  "intelia:initiatives.blocked_one": "{{count}} Blocked",
  "intelia:initiatives.blocked_other": "{{count}} Blocked",
  "intelia:initiatives.blockReasonNone": "Sin detalle registrado",
  "intelia:initiatives.unassigned": "Sin asignar",
  "intelia:initiatives.progress.percent": "{{percent}} %",
  "intelia:initiatives.progress.doneOfActive": "{{done}}/{{active}} hechas",
  "intelia:initiatives.progress.cancelled": "{{count}} canceladas",
  "intelia:initiatives.progress.cancelled_one": "{{count}} cancelada",
  "intelia:initiatives.progress.cancelled_other": "{{count}} canceladas",
  "intelia:initiatives.progress.none": "—",
  "intelia:initiatives.progress.aria":
    "{{done}} de {{active}} tareas activas hechas, {{cancelled}} canceladas",
  "intelia:initiatives.progress.ariaNone":
    "Sin tareas activas, {{cancelled}} canceladas",
  "intelia:initiatives.scope.planTitle": "Plan original · {{count}} tareas",
  "intelia:initiatives.scope.addedTitle": "Alcance añadido · {{count}} tareas",
  "intelia:initiatives.scope.noActive": "— · sin tareas activas",
  "intelia:initiatives.scope.noAdded": "sin añadido",
  "intelia:initiatives.growth.growth":
    "Alcance bruto: {{from}} → {{to}} tareas · +{{percent}} %",
  "intelia:initiatives.growth.none": "Sin tareas",
  "intelia:initiatives.list.stats.inFlight": "En vuelo",
  "intelia:initiatives.list.stats.withBlocked": "Con tareas Blocked",
  "intelia:initiatives.list.stats.addedVsPlan": "Añadidas frente a plan",
  "intelia:initiatives.list.stats.addedVsPlanSub":
    "+{{percent}} % · solo las {{inFlight}} en vuelo",
  "intelia:initiatives.list.stats.cancelled": "Canceladas",
  "intelia:initiatives.list.stats.cancelledSub": "Excluidas del avance",
  "intelia:initiatives.list.toolbar.searchPlaceholder": "Buscar iniciativa…",
  "intelia:initiatives.list.toolbar.searchAria": "Buscar iniciativas",
  "intelia:initiatives.list.toolbar.filterLabel": "Filtrar iniciativas",
  "intelia:initiatives.list.toolbar.filterAll": "Todas en vuelo",
  "intelia:initiatives.list.toolbar.filterBlocked": "Con Blocked",
  "intelia:initiatives.list.toolbar.filterAdded": "Con añadido",
  "intelia:initiatives.list.toolbar.sortLabel": "Orden de iniciativas",
  "intelia:initiatives.list.toolbar.sortBlocked": "Bloqueadas primero",
  "intelia:initiatives.list.toolbar.sortName": "Nombre",
  "intelia:initiatives.list.toolbar.sortProgress": "Menor avance",
  "intelia:initiatives.list.heading.visibleCount_one":
    "{{count}} iniciativa visible",
  "intelia:initiatives.list.heading.visibleCount_other":
    "{{count}} iniciativas visibles",
  "intelia:initiatives.list.heading.doneOfActive": "Hechas / activas",
  "intelia:initiatives.list.heading.subtitle":
    "{{inFlight}} en vuelo · {{finished}} finalizadas",
  "intelia:initiatives.list.row.planAndAdded_one":
    "▤ {{plan}} plan + {{added}} añadida",
  "intelia:initiatives.list.row.planAndAdded_other":
    "▤ {{plan}} plan + {{added}} añadidas",
  "intelia:initiatives.list.row.unrecorded": " · {{count}} sin registro",
  "intelia:initiatives.list.row.inExecution": "En ejecución",
  "intelia:initiatives.list.emptyFiltered":
    "Sin resultados. Cambia los filtros.",
  "intelia:initiatives.list.emptyProject":
    "No hay iniciativas en este proyecto.",
  "intelia:initiatives.list.emptyInFlight": "No hay iniciativas en vuelo.",
  "intelia:initiatives.list.inspector.preview": "Vista previa",
  "intelia:initiatives.list.inspector.requiresAttention": "Requiere atención",
  "intelia:initiatives.list.inspector.inFlight": "En vuelo",
  "intelia:initiatives.list.inspector.viewInitiative": "Ver iniciativa →",
  "intelia:initiatives.list.inspector.tree": "Árbol",
  "intelia:initiatives.list.inspector.blockedTitle_one":
    "{{count}} tarea Blocked",
  "intelia:initiatives.list.inspector.blockedTitle_other":
    "{{count}} tareas Blocked",
  "intelia:initiatives.list.inspector.approvalLabel": "Diseño y aprobación",
  "intelia:initiatives.list.inspector.approvalBy":
    "Aprobada por {{name}} · {{date}}",
  "intelia:initiatives.list.inspector.approvalNoDate": "Aprobada por {{name}}",
  "intelia:initiatives.list.inspector.noApproval": "Sin aprobación registrada",
  "intelia:initiatives.list.inspector.designLabel": "Diseño",
  "intelia:initiatives.list.inspector.designDoc": "↗ Documento de diseño",
  "intelia:initiatives.list.inspector.noDesign": "Sin diseño enlazado",
  "intelia:initiatives.list.sections.finished": "✓ Finalizadas · {{count}}",
  "intelia:initiatives.list.sections.finishedRowFoot_one":
    "▤ {{plan}} plan · {{added}} añadida",
  "intelia:initiatives.list.sections.finishedRowFoot_other":
    "▤ {{plan}} plan · {{added}} añadidas",
  "intelia:initiatives.list.sections.inactive":
    "Sin trabajo activo · {{count}}",
  "intelia:initiatives.list.sections.noTasks": "Sin tareas · —",
  "intelia:initiatives.list.sections.allCancelled_one":
    "— · {{count}} cancelada",
  "intelia:initiatives.list.sections.allCancelled_other":
    "— · {{count}} canceladas",
  "intelia:initiatives.list.sections.withoutInitiative":
    "Sin iniciativa · {{count}} tareas",
  "intelia:initiatives.list.sections.withoutInitiativeSubtitle":
    "Fuera de los totales de iniciativas. Asignar desde el detalle de tarea existente.",
};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      let resolvedKey = key;
      if (options?.count !== undefined) {
        const countKey = `${key}_${options.count === 1 ? "one" : "other"}`;
        if (translations[countKey]) resolvedKey = countKey;
      }
      let val = translations[resolvedKey] ?? key;
      if (options) {
        for (const [k, v] of Object.entries(options)) {
          val = val.replace(
            new RegExp(`\\{\\{${k}\\}\\}`, "g"),
            String(v ?? ""),
          );
        }
      }
      return val;
    },
    i18n: { language: "es" },
  }),
}));

vi.mock("@/components/common/project-layout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/page-title", () => ({
  default: () => null,
}));

vi.mock("@/components/task/task-details-sheet", () => ({
  default: ({ taskId }: { taskId?: string }) =>
    taskId ? (
      <div data-testid="task-details-sheet">TaskSheet:{taskId}</div>
    ) : null,
}));

vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: () => ({
    data: { id: "proj-1", name: "Proyecto Demo", slug: "SF" },
  }),
}));

vi.mock("@/hooks/queries/task/use-get-tasks", () => ({
  useGetTasks: () => ({
    data: {
      slug: "SF",
      name: "Proyecto Demo",
      columns: [
        { id: "col-1", slug: "blocked", name: "Bloqueada" },
        { id: "col-2", slug: "in-progress", name: "En progreso" },
        { id: "col-3", slug: "done", name: "Hecha" },
      ],
    },
  }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => isMobileValue,
}));

const mockData: ProjectInitiatives = {
  initiatives: [
    {
      id: "init-1",
      projectId: "proj-1",
      name: "Importación de pedidos",
      designUrl: "https://example.com/design",
      approvedBy: "Persona A",
      approvedAt: "2026-10-12T00:00:00.000Z",
      createdByUserId: "user-1",
      createdByName: "Persona A",
      createdByActor: null,
      source: "session",
      createdAt: "2026-10-10T00:00:00.000Z",
      planClosedAt: "2026-10-12T00:00:00.000Z",
      state: "in_flight",
      counters: {
        total: 12,
        active: 10,
        done: 5,
        cancelled: 2,
        blocked: 1,
        plan: { total: 8, active: 7, done: 4 },
        added: { total: 4, active: 3, done: 1 },
        unrecorded: { total: 0, active: 0, done: 0 },
      },
      blockedTasks: [
        {
          id: "t-1",
          number: 6,
          title: "Verificar reintentos idempotentes",
          assignee: { id: "u-2", name: "agente-b" },
          statusSince: "2026-10-28T00:00:00.000Z",
          blockReason: "Falta contrato",
          blockReasonDetail: "Falta el contrato de respuesta del gateway.",
        },
      ],
    },
    {
      id: "init-2",
      projectId: "proj-1",
      name: "Copias de seguridad",
      designUrl: null,
      approvedBy: null,
      approvedAt: null,
      createdByUserId: "user-1",
      createdByName: "Persona A",
      createdByActor: null,
      source: "session",
      createdAt: "2026-10-11T00:00:00.000Z",
      planClosedAt: null,
      state: "in_flight",
      counters: {
        total: 11,
        active: 11,
        done: 4,
        cancelled: 0,
        blocked: 0,
        plan: { total: 9, active: 9, done: 4 },
        added: { total: 2, active: 2, done: 0 },
        unrecorded: { total: 0, active: 0, done: 0 },
      },
      blockedTasks: [],
    },
    {
      id: "init-3",
      projectId: "proj-1",
      name: "Panel de métricas",
      designUrl: null,
      approvedBy: null,
      approvedAt: null,
      createdByUserId: "user-1",
      createdByName: "Persona A",
      createdByActor: null,
      source: "session",
      createdAt: "2026-10-15T00:00:00.000Z",
      planClosedAt: null,
      state: "in_flight",
      counters: {
        total: 6,
        active: 6,
        done: 0,
        cancelled: 0,
        blocked: 0,
        plan: { total: 6, active: 6, done: 0 },
        added: { total: 0, active: 0, done: 0 },
        unrecorded: { total: 0, active: 0, done: 0 },
      },
      blockedTasks: [],
    },
    {
      id: "init-4",
      projectId: "proj-1",
      name: "Exportación de informes",
      designUrl: null,
      approvedBy: null,
      approvedAt: null,
      createdByUserId: "user-1",
      createdByName: "Persona A",
      createdByActor: null,
      source: "session",
      createdAt: "2026-10-01T00:00:00.000Z",
      planClosedAt: null,
      state: "finished",
      counters: {
        total: 6,
        active: 6,
        done: 6,
        cancelled: 0,
        blocked: 0,
        plan: { total: 6, active: 6, done: 6 },
        added: { total: 0, active: 0, done: 0 },
        unrecorded: { total: 0, active: 0, done: 0 },
      },
      blockedTasks: [],
    },
    {
      id: "init-5",
      projectId: "proj-1",
      name: "Diseño del catálogo",
      designUrl: null,
      approvedBy: null,
      approvedAt: null,
      createdByUserId: "user-1",
      createdByName: "Persona A",
      createdByActor: null,
      source: "session",
      createdAt: "2026-10-02T00:00:00.000Z",
      planClosedAt: null,
      state: "no_tasks",
      counters: {
        total: 0,
        active: 0,
        done: 0,
        cancelled: 0,
        blocked: 0,
        plan: { total: 0, active: 0, done: 0 },
        added: { total: 0, active: 0, done: 0 },
        unrecorded: { total: 0, active: 0, done: 0 },
      },
      blockedTasks: [],
    },
    {
      id: "init-6",
      projectId: "proj-1",
      name: "Adaptador heredado",
      designUrl: null,
      approvedBy: null,
      approvedAt: null,
      createdByUserId: "user-1",
      createdByName: "Persona A",
      createdByActor: null,
      source: "session",
      createdAt: "2026-10-03T00:00:00.000Z",
      planClosedAt: null,
      state: "all_cancelled",
      counters: {
        total: 3,
        active: 0,
        done: 0,
        cancelled: 3,
        blocked: 0,
        plan: { total: 3, active: 0, done: 0 },
        added: { total: 0, active: 0, done: 0 },
        unrecorded: { total: 0, active: 0, done: 0 },
      },
      blockedTasks: [],
    },
  ],
  withoutInitiative: [
    {
      id: "task-wo-1",
      number: 160,
      title: "Revisar permisos heredados",
      status: "blocked",
      assignee: { id: "u-2", name: "agente-b" },
    },
    {
      id: "task-wo-2",
      number: 161,
      title: "Documentar el despliegue",
      status: "in-progress",
      assignee: null,
    },
  ],
};

let currentProjectData: ProjectInitiatives | undefined = mockData;
let currentIsLoading = false;
let currentIsError = false;

vi.mock("../api", () => ({
  useProjectInitiatives: () => ({
    data: currentProjectData,
    isLoading: currentIsLoading,
    isError: currentIsError,
    refetch: vi.fn(),
  }),
}));

beforeEach(() => {
  mockNavigate.mockClear();
  isMobileValue = false;
  currentProjectData = mockData;
  currentIsLoading = false;
  currentIsError = false;
});

afterEach(() => {
  cleanup();
});

describe("InitiativesPage", () => {
  it("renders the 4 figures on top over in-flight initiatives", () => {
    render(
      <InitiativesPage workspaceId="ws-1" projectId="proj-1" search={{}} />,
    );

    expect(screen.getByText("En vuelo")).toBeDefined();
    expect(screen.getByText("Con tareas Blocked")).toBeDefined();
    expect(screen.getByText("Añadidas frente a plan")).toBeDefined();
    expect(screen.getByText("Canceladas")).toBeDefined();

    // 3 in-flight initiatives: Importación de pedidos (blocked=1), Copias de seguridad (blocked=0), Panel de métricas (blocked=0)
    // withBlocked = 1
    // added = 4 + 2 + 0 = 6, planned = 8 + 9 + 6 = 23
    // cancelled = 2 + 0 + 0 = 2
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getByText("6 / 23")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
  });

  it("renders in-flight initiatives sorted by blocked first by default", () => {
    render(
      <InitiativesPage workspaceId="ws-1" projectId="proj-1" search={{}} />,
    );

    const rows = screen.getAllByTestId("initiative-row");
    expect(rows.length).toBe(3);
    // "Importación de pedidos" has 1 blocked task, so it must be first
    expect(rows[0].textContent).toContain("Importación de pedidos");
    // Next two have 0 blocked, sorted by name: Copias de seguridad before Panel de métricas
    expect(rows[1].textContent).toContain("Copias de seguridad");
    expect(rows[2].textContent).toContain("Panel de métricas");
  });

  it("filters by blocked tasks when filter='blocked'", () => {
    render(
      <InitiativesPage
        workspaceId="ws-1"
        projectId="proj-1"
        search={{ filter: "blocked" }}
      />,
    );

    const rows = screen.getAllByTestId("initiative-row");
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain("Importación de pedidos");
    expect(screen.queryByText("Copias de seguridad")).toBeNull();
  });

  it("filters by added scope when filter='added'", () => {
    render(
      <InitiativesPage
        workspaceId="ws-1"
        projectId="proj-1"
        search={{ filter: "added" }}
      />,
    );

    const rows = screen.getAllByTestId("initiative-row");
    // Importación (added: 4), Copias (added: 2), Panel (added: 0)
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain("Importación de pedidos");
    expect(rows[1].textContent).toContain("Copias de seguridad");
    expect(screen.queryByText("Panel de métricas")).toBeNull();
  });

  it("filters by search query 'q'", () => {
    render(
      <InitiativesPage
        workspaceId="ws-1"
        projectId="proj-1"
        search={{ q: "métricas" }}
      />,
    );

    const rows = screen.getAllByTestId("initiative-row");
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain("Panel de métricas");
  });

  it("shows empty state when filters leave 0 matching initiatives", () => {
    render(
      <InitiativesPage
        workspaceId="ws-1"
        projectId="proj-1"
        search={{ q: "no-coincide-con-nada" }}
      />,
    );

    expect(
      screen.getByText("Sin resultados. Cambia los filtros."),
    ).toBeDefined();
  });

  it("renders collapsed sections with correct counts and content", () => {
    render(
      <InitiativesPage workspaceId="ws-1" projectId="proj-1" search={{}} />,
    );

    // Section 1: Finalizadas
    expect(screen.getByText("✓ Finalizadas · 1")).toBeDefined();
    expect(screen.getByText("Exportación de informes")).toBeDefined();

    // Section 2: Sin trabajo activo (2 items: no_tasks and all_cancelled)
    expect(screen.getByText("Sin trabajo activo · 2")).toBeDefined();
    expect(screen.getByText("Diseño del catálogo")).toBeDefined();
    expect(screen.getByText("Sin tareas · —")).toBeDefined();
    expect(screen.getByText("Adaptador heredado")).toBeDefined();
    expect(screen.getByText("— · 3 canceladas")).toBeDefined();

    // Section 3: Sin iniciativa
    expect(screen.getByText("Sin iniciativa · 2 tareas")).toBeDefined();
    expect(
      screen.getByText(/SF-160 · Revisar permisos heredados/),
    ).toBeDefined();
    expect(screen.getByText(/SF-161 · Documentar el despliegue/)).toBeDefined();
  });

  it("clicking task without initiative opens the task sheet via search param", () => {
    render(
      <InitiativesPage workspaceId="ws-1" projectId="proj-1" search={{}} />,
    );

    const taskButton = screen
      .getByText(/SF-160 · Revisar permisos heredados/)
      .closest("button")!;
    fireEvent.click(taskButton);

    expect(mockNavigate).toHaveBeenCalledWith({
      to: ".",
      search: expect.any(Function),
      replace: true,
    });
  });

  it("desktop (>=768px): displays inspector panel on the right for selected initiative", () => {
    isMobileValue = false;
    render(
      <InitiativesPage
        workspaceId="ws-1"
        projectId="proj-1"
        search={{ selected: "init-1" }}
      />,
    );

    const inspector = screen.getByRole("complementary", {
      name: "Vista previa",
    });
    expect(inspector).toBeDefined();

    // Blocked tag
    expect(inspector.textContent).toContain("Requiere atención");
    // Blocked tasks in inspector
    expect(inspector.textContent).toContain("1 tarea Blocked");
    expect(inspector.textContent).toContain(
      "SF-6 · Verificar reintentos idempotentes",
    );
    expect(inspector.textContent).toContain(
      "Falta contrato: Falta el contrato de respuesta del gateway.",
    );
    expect(inspector.textContent).toContain("agente-b");

    // Approval
    expect(inspector.textContent).toContain("Aprobada por Persona A");
    // Design link
    const designLink = screen.getByRole("link", {
      name: "↗ Documento de diseño",
    });
    expect(designLink.getAttribute("href")).toBe("https://example.com/design");
    expect(designLink.getAttribute("rel")).toContain("noopener");
  });

  it("mobile (<768px): hides inspector panel and row click navigates directly to detail", () => {
    isMobileValue = true;
    render(
      <InitiativesPage workspaceId="ws-1" projectId="proj-1" search={{}} />,
    );

    // No inspector
    expect(
      screen.queryByRole("complementary", { name: "Vista previa" }),
    ).toBeNull();

    // Clicking a row navigates directly to detail
    const row = screen.getByText("Importación de pedidos").closest("button")!;
    fireEvent.click(row);

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/initiatives/$initiativeId",
      params: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        initiativeId: "init-1",
      },
      search: {
        tab: "tasks",
      },
    });
  });

  it("enforces progress rules: never shows percentage alone", () => {
    render(
      <InitiativesPage workspaceId="ws-1" projectId="proj-1" search={{}} />,
    );

    // For Importación de pedidos: 5 done / 10 active = 50%, 2 cancelled
    const progressImgs = screen.getAllByRole("img");
    const img50 = progressImgs.find((img) =>
      img.getAttribute("aria-label")?.includes("5 de 10 tareas activas hechas"),
    );
    expect(img50).toBeDefined();
    // The rendered text includes done/active and cancelled
    expect(img50!.textContent).toContain("50 %");
    expect(img50!.textContent).toContain("5/10 hechas");
    expect(img50!.textContent).toContain("2 canceladas");
  });
  it("pluralizes added scope correctly and does not duplicate cancelled count in row foot", () => {
    // Create an initiative with added: 1 to check "1 añadida"
    currentProjectData = {
      initiatives: [
        {
          ...mockData.initiatives[0],
          id: "init-single-added",
          name: "Iniciativa con una añadida",
          counters: {
            ...mockData.initiatives[0].counters,
            plan: { total: 5, active: 5, done: 2 },
            added: { total: 1, active: 1, done: 0 },
            cancelled: 0,
          },
        },
        {
          ...mockData.initiatives[0],
          id: "init-multi-added",
          name: "Iniciativa con varias añadidas",
          counters: {
            ...mockData.initiatives[0].counters,
            plan: { total: 5, active: 5, done: 2 },
            added: { total: 3, active: 3, done: 1 },
            cancelled: 2,
          },
        },
      ],
      withoutInitiative: [],
    };

    render(
      <InitiativesPage workspaceId="ws-1" projectId="proj-1" search={{}} />,
    );

    // Singular pluralization
    expect(screen.getByText("▤ 5 plan + 1 añadida")).toBeDefined();
    // Plural pluralization
    expect(screen.getByText("▤ 5 plan + 3 añadidas")).toBeDefined();

    // "Sin canceladas" should NOT appear anywhere as duplicate foot text
    expect(screen.queryByText("Sin canceladas")).toBeNull();
  });

  it("renders loading state when isLoading is true", () => {
    currentIsLoading = true;
    currentProjectData = undefined;
    render(
      <InitiativesPage workspaceId="ws-1" projectId="proj-1" search={{}} />,
    );

    expect(screen.getByText("Cargando iniciativas…")).toBeDefined();
  });

  it("renders error state when isError is true", () => {
    currentIsError = true;
    currentProjectData = undefined;
    render(
      <InitiativesPage workspaceId="ws-1" projectId="proj-1" search={{}} />,
    );

    expect(
      screen.getByText("No se pudieron cargar las iniciativas"),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeDefined();
  });
});
