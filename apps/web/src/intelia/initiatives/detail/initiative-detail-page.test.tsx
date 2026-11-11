import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
import { toast } from "@/lib/toast";
import type { InitiativeChange, InitiativeDetail } from "../api";
import { rememberListSearch } from "../search";
import { InitiativeDetailPage } from "./initiative-detail-page";
import "./i18n";
import "../i18n";

// Initialize real i18n in Spanish for test assertion checks
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: "es",
    fallbackLng: "es",
    interpolation: { escapeValue: false },
    resources: {},
  });
} else {
  i18n.changeLanguage("es");
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useInitiative: vi.fn(),
  useInitiativeHistory: vi.fn(),
  useUpdateInitiative: vi.fn(),
  mutateAsync: vi.fn(),
  useGetProject: vi.fn(),
  useGetTasks: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/components/common/project-layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="project-layout">{children}</div>
  ),
}));

vi.mock("@/components/page-title", () => ({
  default: () => null,
}));

vi.mock("@/components/task/task-details-sheet", () => ({
  default: ({
    taskId,
    projectId,
    onClose,
  }: {
    taskId?: string;
    projectId: string;
    onClose: () => void;
  }) =>
    taskId ? (
      <div data-testid="task-details-sheet" data-project-id={projectId}>
        <span>Sheet for {taskId}</span>
        <button type="button" onClick={onClose}>
          Close sheet
        </button>
      </div>
    ) : null,
}));

vi.mock("@/intelia/dependencies/components/initiative-tree", () => ({
  InitiativeTree: ({
    showCancelled,
    onShowCancelledChange,
    onOpenTask,
  }: {
    showCancelled: boolean;
    onShowCancelledChange: (v: boolean) => void;
    onOpenTask: (id: string) => void;
  }) => (
    <div data-testid="initiative-tree">
      <span>Tree rendered (cancelled: {String(showCancelled)})</span>
      <button type="button" onClick={() => onShowCancelledChange(true)}>
        Show cancelled
      </button>
      <button type="button" onClick={() => onOpenTask("task-tree-1")}>
        Open tree task
      </button>
    </div>
  ),
}));

// The tab has its own suite (tasks-tab/tasks-tab.test.tsx).
vi.mock("./tasks-tab/tasks-tab", () => ({
  TasksTab: () => <div data-testid="tasks-tab" />,
}));

vi.mock("../api", () => ({
  useInitiative: (...args: unknown[]) => mocks.useInitiative(...args),
  useInitiativePlan: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useInitiativeHistory: (...args: unknown[]) =>
    mocks.useInitiativeHistory(...args),
  useUpdateInitiative: (...args: unknown[]) =>
    mocks.useUpdateInitiative(...args),
}));

vi.mock("../use-external-plan-realtime", () => ({
  useExternalPlanRealtime: () => {},
}));

vi.mock("@/hooks/queries/column/use-get-columns", () => ({
  useGetColumns: () => ({ data: [] }),
}));

vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: (...args: unknown[]) => mocks.useGetProject(...args),
}));

vi.mock("@/hooks/queries/task/use-get-tasks", () => ({
  useGetTasks: (...args: unknown[]) => mocks.useGetTasks(...args),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockInitiative: InitiativeDetail = {
  id: "init-1",
  projectId: "proj-1",
  name: "Importación de pedidos",
  objetivo: null,
  hitos_externos: null,
  estado_compartido: null,
  designUrl: "https://example.com/design",
  approvedBy: "Persona A",
  approvedAt: "2026-10-12T00:00:00.000Z",
  createdByUserId: "user-1",
  createdByName: "Persona A",
  createdByActor: null,
  source: "session",
  createdAt: "2026-10-10T12:00:00.000Z",
  planClosedAt: "2026-10-15T00:00:00.000Z",
  state: "in_flight",
  counters: {
    total: 3,
    active: 2,
    done: 1,
    cancelled: 1,
    blocked: 1,
    plan: { total: 2, active: 1, done: 1 },
    added: { total: 1, active: 1, done: 0 },
    unrecorded: { total: 0, active: 0, done: 0 },
    hidden: { total: 0, active: 0, done: 0 },
  },
  tasks: [
    {
      id: "task-1",
      number: 101,
      projectId: "proj-1",
      projectSlug: "DEMO",
      title: "Validar contratos",
      status: "done",
      origin: "plan",
      since: "2026-10-10T12:00:00.000Z",
      assignee: { id: "user-1", name: "Agente A" },
      statusSince: "2026-10-11T12:00:00.000Z",
      blockReason: null,
      blockReasonDetail: null,
      dependsOn: ["ext-1"],
      blocks: ["task-2"],
    },
    {
      id: "task-2",
      number: 102,
      projectId: "proj-1",
      projectSlug: "DEMO",
      title: "Verificar reintentos idempotentes",
      status: "blocked",
      origin: "plan",
      since: "2026-10-10T12:00:00.000Z",
      assignee: { id: "user-2", name: "Agente B" },
      statusSince: "2026-10-12T12:00:00.000Z",
      blockReason: "Falta contrato",
      blockReasonDetail: "Esperando respuesta del gateway",
      dependsOn: ["task-1", "ext-1"],
      blocks: [],
    },
    {
      id: "task-3",
      number: 103,
      projectId: "proj-1",
      projectSlug: "DEMO",
      title: "Adaptador antiguo",
      status: "cancelled",
      origin: "añadido",
      since: "2026-10-16T12:00:00.000Z",
      assignee: null,
      statusSince: "2026-10-17T12:00:00.000Z",
      blockReason: null,
      blockReasonDetail: null,
      dependsOn: [],
      blocks: [],
    },
  ],
  externalTasks: [
    {
      id: "ext-1",
      number: 50,
      title: "Gateway base",
      status: "done",
      projectId: "proj-ext",
      projectSlug: "GW",
      projectName: "Gateway",
      initiativeId: null,
    },
  ],
  pendingChain: {
    taskIds: ["task-2"],
    partial: false,
    cycle: false,
  },
};

const mockHistory: InitiativeChange[] = [
  {
    id: "change-2",
    initiativeId: "init-1",
    kind: "updated",
    previous: { name: "Antiguo nombre" },
    value: { name: "Importación de pedidos" },
    taskId: null,
    source: "session",
    changedByUserId: "user-1",
    changedByName: "Persona A",
    changedByActor: null,
    changedAt: "2026-10-16T10:00:00.000Z",
  },
  {
    id: "change-1",
    initiativeId: "init-1",
    kind: "created",
    previous: null,
    value: { name: "Antiguo nombre" },
    taskId: null,
    source: "session",
    changedByUserId: "user-1",
    changedByName: "Persona A",
    changedByActor: null,
    changedAt: "2026-10-10T12:00:00.000Z",
  },
];

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.mutateAsync.mockReset().mockResolvedValue({});
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();

  mocks.useInitiative.mockReturnValue({
    data: mockInitiative,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });

  mocks.useInitiativeHistory.mockReturnValue({
    data: mockHistory,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });

  mocks.useUpdateInitiative.mockReturnValue({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  });

  mocks.useGetProject.mockReturnValue({
    data: { id: "proj-1", slug: "DEMO", name: "Proyecto Demo" },
  });

  mocks.useGetTasks.mockReturnValue({
    data: {
      columns: [
        { id: "col-done", slug: "done", name: "Finalizada" },
        { id: "col-blocked", slug: "blocked", name: "Bloqueada" },
        { id: "col-cancelled", slug: "cancelled", name: "Cancelada" },
      ],
    },
  });
});

afterEach(() => {
  cleanup();
});

describe("InitiativeDetailPage", () => {
  it("opens a task of another project of the initiative in its own project", () => {
    mocks.useInitiative.mockReturnValue({
      data: {
        ...mockInitiative,
        tasks: mockInitiative.tasks.map((task) =>
          task.id === "task-2"
            ? { ...task, projectId: "proj-infra", projectSlug: "INFRA" }
            : task,
        ),
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(
      <InitiativeDetailPage
        workspaceId="ws-1"
        projectId="proj-1"
        initiativeId="init-1"
        search={{ taskId: "task-2" }}
      />,
    );

    expect(screen.getByTestId("task-details-sheet")).toHaveAttribute(
      "data-project-id",
      "proj-infra",
    );
  });

  it("renders header with name, state tag, progress figures, design link, approval and plan state", () => {
    render(
      <InitiativeDetailPage
        workspaceId="ws-1"
        projectId="proj-1"
        initiativeId="init-1"
        search={{}}
      />,
    );

    expect(screen.getByText("Importación de pedidos")).toBeInTheDocument();
    expect(screen.getByText("En vuelo")).toBeInTheDocument();
    // Progress figures: 1/2 hechas, 50 %, 1 cancelada
    expect(screen.getByText("1/2 hechas")).toBeInTheDocument();
    expect(screen.getByText("50 %")).toBeInTheDocument();
    expect(screen.getByText("1 cancelada")).toBeInTheDocument();
    // +1 añadida tag
    expect(screen.getByText("+ 1 añadida")).toBeInTheDocument();
    // Design link
    const designLink = screen.getByRole("link", { name: /Diseño/ });
    expect(designLink).toHaveAttribute("href", "https://example.com/design");
    expect(designLink).toHaveAttribute("target", "_blank");
    // Approval text
    expect(screen.getByText(/Aprobada por Persona A/)).toBeInTheDocument();
    // Plan state
    expect(screen.getByText(/Plan cerrado el/)).toBeInTheDocument();
  });

  it("returns to the listing with the search it had when the detail opened", () => {
    rememberListSearch("proj-1", {
      q: "pedidos",
      sort: "name",
      selected: "init-1",
      taskId: "task-open",
    });

    render(
      <InitiativeDetailPage
        workspaceId="ws-1"
        projectId="proj-1"
        initiativeId="init-1"
        search={{}}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "← Todas las iniciativas" }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/initiatives",
      params: { workspaceId: "ws-1", projectId: "proj-1" },
      search: {
        q: "pedidos",
        sort: "name",
        selected: "init-1",
        taskId: undefined,
      },
    });
  });

  describe("Edit dialog", () => {
    it("opens dialog, populates current values, and does not send PATCH if unchanged", async () => {
      render(
        <InitiativeDetailPage
          workspaceId="ws-1"
          projectId="proj-1"
          initiativeId="init-1"
          search={{}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Editar" }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByLabelText(/Nombre \*/)).toHaveValue(
        "Importación de pedidos",
      );
      expect(screen.getByLabelText(/URL del diseño/)).toHaveValue(
        "https://example.com/design",
      );
      expect(screen.getByLabelText(/Aprobada por/)).toHaveValue("Persona A");
      expect(screen.getByLabelText(/Fecha de aprobación/)).toHaveValue(
        "2026-10-12",
      );

      // Click save without changing anything
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => {
        expect(mocks.mutateAsync).not.toHaveBeenCalled();
      });
    });

    it("sends ONLY changed fields in patch body when modifying name", async () => {
      render(
        <InitiativeDetailPage
          workspaceId="ws-1"
          projectId="proj-1"
          initiativeId="init-1"
          search={{}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Editar" }));

      const nameInput = screen.getByLabelText(/Nombre \*/);
      fireEvent.change(nameInput, {
        target: { value: "Nuevo nombre iniciativa" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => {
        expect(mocks.mutateAsync).toHaveBeenCalledWith({
          initiativeId: "init-1",
          input: {
            name: "Nuevo nombre iniciativa",
          },
        });
      });
      expect(toast.success).toHaveBeenCalledWith("Iniciativa actualizada");
    });

    it("sends null for designUrl, approvedBy and approvedAt when cleared", async () => {
      render(
        <InitiativeDetailPage
          workspaceId="ws-1"
          projectId="proj-1"
          initiativeId="init-1"
          search={{}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Editar" }));

      fireEvent.change(screen.getByLabelText(/URL del diseño/), {
        target: { value: "" },
      });
      fireEvent.change(screen.getByLabelText(/Aprobada por/), {
        target: { value: "" },
      });
      fireEvent.change(screen.getByLabelText(/Fecha de aprobación/), {
        target: { value: "" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => {
        expect(mocks.mutateAsync).toHaveBeenCalledWith({
          initiativeId: "init-1",
          input: {
            designUrl: null,
            approvedBy: null,
            approvedAt: null,
          },
        });
      });
    });

    const nonWebUrls = [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
    ];

    it.each(nonWebUrls)("refuses to save the design link %s", async (url) => {
      render(
        <InitiativeDetailPage
          workspaceId="ws-1"
          projectId="proj-1"
          initiativeId="init-1"
          search={{}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Editar" }));
      fireEvent.change(screen.getByLabelText(/URL del diseño/), {
        target: { value: url },
      });
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      expect(
        await screen.findByText("Debe ser un enlace http o https"),
      ).toBeInTheDocument();
      expect(mocks.mutateAsync).not.toHaveBeenCalled();
    });

    it.each(nonWebUrls)("shows a stored %s as text, never as a link", (url) => {
      mocks.useInitiative.mockReturnValue({
        data: { ...mockInitiative, designUrl: url },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(
        <InitiativeDetailPage
          workspaceId="ws-1"
          projectId="proj-1"
          initiativeId="init-1"
          search={{}}
        />,
      );

      expect(screen.getByText(url)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Diseño/ })).toBeNull();
      for (const link of document.querySelectorAll("a"))
        expect(link.getAttribute("href")).not.toBe(url);
    });

    it("maps 409 INITIATIVE_NAME_TAKEN error to user-friendly Spanish message", async () => {
      mocks.mutateAsync.mockRejectedValue({
        status: 409,
        code: "INITIATIVE_NAME_TAKEN",
        message: "The project already has an initiative with that name",
      });

      render(
        <InitiativeDetailPage
          workspaceId="ws-1"
          projectId="proj-1"
          initiativeId="init-1"
          search={{}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Editar" }));
      fireEvent.change(screen.getByLabelText(/Nombre \*/), {
        target: { value: "Otro nombre duplicado" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => {
        expect(
          screen.getByText(
            "Ya existe una iniciativa con ese nombre en el proyecto",
          ),
        ).toBeInTheDocument();
      });
      expect(toast.error).toHaveBeenCalledWith(
        "Ya existe una iniciativa con ese nombre en el proyecto",
      );
    });

    it("maps 403 forbidden error to user-friendly Spanish message", async () => {
      mocks.mutateAsync.mockRejectedValue({
        status: 403,
        message: "Forbidden",
      });

      render(
        <InitiativeDetailPage
          workspaceId="ws-1"
          projectId="proj-1"
          initiativeId="init-1"
          search={{}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Editar" }));
      fireEvent.change(screen.getByLabelText(/Nombre \*/), {
        target: { value: "Cambio sin permiso" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => {
        expect(
          screen.getByText("No tienes permiso para editar esta iniciativa"),
        ).toBeInTheDocument();
      });
      expect(toast.error).toHaveBeenCalledWith(
        "No tienes permiso para editar esta iniciativa",
      );
    });

    it("maps 500 server error with nonempty server message to generic error message", async () => {
      mocks.mutateAsync.mockRejectedValue({
        status: 500,
        message: "Internal server error: DB disconnected",
      });

      render(
        <InitiativeDetailPage
          workspaceId="ws-1"
          projectId="proj-1"
          initiativeId="init-1"
          search={{}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Editar" }));
      fireEvent.change(screen.getByLabelText(/Nombre \*/), {
        target: { value: "Cambio con fallo 500" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => {
        expect(
          screen.getByText("Error al actualizar la iniciativa"),
        ).toBeInTheDocument();
      });
      expect(
        screen.queryByText("Internal server error: DB disconnected"),
      ).not.toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith(
        "Error al actualizar la iniciativa",
      );
    });
  });

  describe("Edge states", () => {
    it("handles no_tasks state without showing 0 %", () => {
      mocks.useInitiative.mockReturnValue({
        data: {
          ...mockInitiative,
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
            hidden: { total: 0, active: 0, done: 0 },
          },
          tasks: [],
          externalTasks: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(
        <InitiativeDetailPage
          workspaceId="ws-1"
          projectId="proj-1"
          initiativeId="init-1"
          search={{}}
        />,
      );

      expect(screen.getAllByText("Sin tareas").length).toBeGreaterThan(0);
      expect(screen.queryByText("0 %")).not.toBeInTheDocument();
    });

    it("handles all_cancelled state without showing 100 %", () => {
      mocks.useInitiative.mockReturnValue({
        data: {
          ...mockInitiative,
          state: "all_cancelled",
          counters: {
            total: 2,
            active: 0,
            done: 0,
            cancelled: 2,
            blocked: 0,
            plan: { total: 2, active: 0, done: 0 },
            added: { total: 0, active: 0, done: 0 },
            unrecorded: { total: 0, active: 0, done: 0 },
            hidden: { total: 0, active: 0, done: 0 },
          },
          tasks: [
            {
              id: "task-c1",
              number: 201,
              title: "Cancelada 1",
              status: "cancelled",
              origin: "plan",
              since: "2026-10-10T12:00:00.000Z",
              assignee: null,
              statusSince: "2026-10-11T12:00:00.000Z",
              blockReason: null,
              blockReasonDetail: null,
              dependsOn: [],
              blocks: [],
            },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(
        <InitiativeDetailPage
          workspaceId="ws-1"
          projectId="proj-1"
          initiativeId="init-1"
          search={{}}
        />,
      );

      expect(screen.getByText("Todas canceladas")).toBeInTheDocument();
      expect(screen.queryByText("100 %")).not.toBeInTheDocument();
      expect(screen.getByText("2 canceladas")).toBeInTheDocument();
    });
  });

  describe("Historial collapsible", () => {
    it("displays history entries newest first and shows diffs for updated", () => {
      render(
        <InitiativeDetailPage
          workspaceId="ws-1"
          projectId="proj-1"
          initiativeId="init-1"
          search={{}}
        />,
      );

      // Open collapsible
      fireEvent.click(screen.getByText("Historial"));

      expect(screen.getByText("Datos actualizados")).toBeInTheDocument();
      expect(screen.getByText("Iniciativa creada")).toBeInTheDocument();
      expect(screen.getByText("Antiguo nombre")).toBeInTheDocument();
      expect(screen.getByText("Nombre:")).toBeInTheDocument();
    });
  });

  describe("Tree tab", () => {
    it("renders InitiativeTree and shows partial/cycle chain banners", () => {
      mocks.useInitiative.mockReturnValue({
        data: {
          ...mockInitiative,
          pendingChain: {
            taskIds: [],
            partial: true,
            cycle: true,
          },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(
        <InitiativeDetailPage
          workspaceId="ws-1"
          projectId="proj-1"
          initiativeId="init-1"
          search={{ tab: "tree" }}
        />,
      );

      expect(
        screen.getByText("Cadena parcial: alguna dependencia no es legible"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Ciclo de dependencias: sin cadena"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("initiative-tree")).toBeInTheDocument();
    });
  });
});
