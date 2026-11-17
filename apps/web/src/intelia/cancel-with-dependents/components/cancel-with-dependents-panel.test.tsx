import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
import type { ErrorDependenciasSinResolver } from "../contract/cancelar-con-dependientes";
import {
  sampleProblemasA,
  sampleProblemasAPreviousChain,
  sampleResultSf2491,
  sampleSf2491,
} from "../samples.test-data";
import type { ChainGraph as ChainGraphModel } from "../chain-graph-model";
import { CancelWithDependentsPanel } from "./cancel-with-dependents-panel";

const search = vi.hoisted(() => ({ results: [] as unknown[] }));
vi.mock("@/hooks/queries/search/use-global-search", () => ({
  default: ({ q }: { q: string }) => ({
    data: q ? { results: search.results } : undefined,
    isFetching: false,
  }),
}));

// jsdom has no layout, so React Flow never measures and renders no node. The
// canvas is swapped for a plain list of the same node components; the graph
// model itself (positions, arrows) is covered in chain-graph-model.test.ts.
vi.mock("./chain-graph", async () => {
  const { ReactFlowProvider } = await import("@xyflow/react");
  const { ChainNode } = await import("./chain-node");
  return {
    ChainGraph: ({ graph }: { graph: ChainGraphModel }) => (
      <ReactFlowProvider>
        {graph.nodes.map((node) => (
          <ChainNode
            key={node.id}
            {...({ id: node.id, data: node.data } as Parameters<
              typeof ChainNode
            >[0])}
          />
        ))}
      </ReactFlowProvider>
    ),
  };
});

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
// Register the bundle after initializing the isolated test i18n instance
// (same as the other intelia tests): a static import would run first.
await import("../i18n");
const fetchMock = vi.fn();

beforeEach(async () => {
  await i18n.changeLanguage("es");
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  search.results = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const REASON = "Se parte el diseño de la pausa de ámbito en dos fases.";

function renderPanel(error: ErrorDependenciasSinResolver = sampleSf2491) {
  const onCancelled = vi.fn();
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CancelWithDependentsPanel
        error={error}
        taskId="task-sf-2491"
        workspaceId="ws"
        onClose={() => {}}
        onCancelled={onCancelled}
      />
    </QueryClientProvider>,
  );
  return { onCancelled };
}

const nodeEl = (ticket: string) => {
  const button = screen.queryByRole("button", {
    name: new RegExp(`^${ticket} `),
  });
  if (button) return button;
  const el = document.querySelector(`[data-ticket="${ticket}"]`);
  if (!el) throw new Error(`node ${ticket} not rendered`);
  return el as HTMLElement;
};
const kindOf = (ticket: string) => nodeEl(ticket).dataset.kind;
const submitButton = () =>
  screen.getByRole("button", { name: /^Cancelar \d+ tarea/ });
const writeReason = (text = REASON) =>
  fireEvent.change(screen.getByLabelText("Motivo"), {
    target: { value: text },
  });
const openNode = (ticket: string) => fireEvent.click(nodeEl(ticket));

function reply(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("CancelWithDependentsPanel", () => {
  it("opens on the root with nothing decided and the button off", () => {
    renderPanel();

    expect(
      screen.getByRole("heading", { name: "Cancelar SF-2491" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Faltan 3 por decidir")).toBeInTheDocument();
    expect(submitButton()).toHaveTextContent("Cancelar 1 tarea");
    expect(submitButton()).toBeDisabled();
    expect(kindOf("SF-2493")).toBe("pendiente");
  });

  it("enables «Cancelar N tareas» only with a reason and nothing pending", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "✕ Cancelar todo" }));
    expect(submitButton()).toHaveTextContent("Cancelar 14 tareas");
    expect(submitButton()).toBeDisabled();
    expect(screen.getByText("Escribe el motivo")).toBeInTheDocument();

    writeReason("corto");
    expect(submitButton()).toBeDisabled();

    writeReason();
    expect(screen.getByText("Todo decidido")).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
  });

  it("«Cancelar con su rama» marks the whole branch of this board", () => {
    renderPanel();

    openNode("SF-2493");
    fireEvent.click(
      screen.getByRole("button", { name: /Cancelar con su rama/ }),
    );

    for (const ticket of ["SF-2493", "SF-2494", "SF-2499", "SF-2504"]) {
      expect(kindOf(ticket), ticket).toBe("cancelar");
    }
    expect(kindOf("SF-2495")).toBe("pendiente");
    expect(screen.getByText("Faltan 2 por decidir")).toBeInTheDocument();
  });

  it("draws other-board nodes amber with their owner and does not open them", () => {
    renderPanel();

    const kf15 = nodeEl("KF-15");
    expect(kf15.tagName).toBe("DIV");
    expect(kf15.dataset.kind).toBe("otro_tablero");
    expect(
      within(kf15).getByText("Responsable: agent:forja"),
    ).toBeInTheDocument();
    fireEvent.click(kf15);
    expect(
      screen.queryByRole("button", { name: /Quitar dependencia/ }),
    ).toBeNull();
    expect(
      screen.getByText(/KF-15: se quita la dependencia/),
    ).toBeInTheDocument();
  });

  it("«Quitar» releases the node and dims its branch", () => {
    renderPanel();

    openNode("SF-2493");
    fireEvent.click(screen.getByRole("button", { name: /Quitar dependencia/ }));

    expect(kindOf("SF-2493")).toBe("quitar");
    // SF-2494 hangs only from SF-2493: no longer touched, not clickable.
    expect(nodeEl("SF-2494").tagName).toBe("DIV");
  });

  it("«Mover a…» moves the dependency to the task picked in the search", () => {
    search.results = [
      {
        id: "t-2496",
        type: "task",
        title: "[PZ-09] Prompts y diseños anteriores",
        projectSlug: "SF",
        projectName: "Software Factory",
        taskNumber: 2496,
        status: "to-do",
        archivedAt: null,
      },
      // Final tasks are not offered.
      {
        id: "t-2425",
        type: "task",
        title: "Cancelada",
        projectSlug: "SF",
        taskNumber: 2425,
        status: "cancelled",
      },
    ];
    renderPanel();

    openNode("SF-2493");
    fireEvent.click(screen.getByRole("button", { name: /Mover a…/ }));
    fireEvent.change(
      screen.getByLabelText("Tarea a la que pasa la dependencia"),
      {
        target: { value: "PZ-09" },
      },
    );
    expect(screen.queryByText("Cancelada")).toBeNull();
    fireEvent.click(
      screen.getByText("Software Factory").closest("button") as HTMLElement,
    );

    expect(kindOf("SF-2493")).toBe("mover");
    expect(
      screen.getByText("SF-2493: de SF-2491 a SF-2496"),
    ).toBeInTheDocument();
  });

  it("sends the decisions and reports the cancellation", async () => {
    reply(200, sampleResultSf2491);
    const { onCancelled } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "✓ Liberar todo" }));
    writeReason();
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(onCancelled).toHaveBeenCalledWith(sampleResultSf2491),
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/intelia\/task\/task-sf-2491\/cancel$/);
    expect(JSON.parse(init.body)).toEqual({
      motivo: REASON,
      resoluciones: [
        { tarea: "SF-2493", accion: "quitar" },
        { tarea: "SF-2495", accion: "quitar" },
        { tarea: "SF-2496", accion: "quitar" },
      ],
    });
  });

  it("redraws on a 409 cadena_cambiada and keeps the decisions that still hold", async () => {
    // The panel opened on the chain before SF-2504 joined it.
    const before: ErrorDependenciasSinResolver = {
      ...sampleSf2491,
      details: {
        ...sampleSf2491.details,
        cadena: sampleProblemasAPreviousChain,
      },
    };
    // What the fork answers for this request: the chain changed, and the new
    // SF-2504 hangs from the cancelled branch, so it is pending.
    reply(409, {
      ...sampleProblemasA,
      details: {
        ...sampleProblemasA.details,
        pendientes: ["SF-2504"],
        problemas: sampleProblemasA.details.problemas.filter(
          (p) => p.problema === "cadena_cambiada",
        ),
        ejemplo_resoluciones: [
          { tarea: "SF-2504", accion: "elige: cancelar | quitar | mover" },
        ],
      },
    });
    const { onCancelled } = renderPanel(before);
    expect(document.querySelector('[data-ticket="SF-2504"]')).toBeNull();

    openNode("SF-2493");
    fireEvent.click(
      screen.getByRole("button", { name: /Cancelar con su rama/ }),
    );
    openNode("SF-2495");
    fireEvent.click(screen.getByRole("button", { name: /Quitar dependencia/ }));
    openNode("SF-2496");
    fireEvent.click(screen.getByRole("button", { name: /Quitar dependencia/ }));
    writeReason();
    fireEvent.click(submitButton());

    await screen.findByText(/La cadena ha cambiado/);
    expect(onCancelled).not.toHaveBeenCalled();
    // Redrawn with the new node, marked as new.
    expect(within(nodeEl("SF-2504")).getByText("Nueva")).toBeInTheDocument();
    // The decisions that still hold are kept; the new node is in the cancelled
    // branch, so it is the only one left.
    expect(kindOf("SF-2493")).toBe("cancelar");
    expect(kindOf("SF-2498")).toBe("cancelar");
    expect(kindOf("SF-2495")).toBe("quitar");
    expect(kindOf("SF-2496")).toBe("quitar");
    expect(kindOf("SF-2504")).toBe("pendiente");
    expect(screen.getByText("Falta 1 por decidir")).toBeInTheDocument();
    expect(screen.getByLabelText("Motivo")).toHaveValue(REASON);
  });
});
