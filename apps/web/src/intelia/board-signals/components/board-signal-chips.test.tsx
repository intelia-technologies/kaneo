import es from "@i18n/es-ES.json";
import { cleanup, render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { BoardSignalTask, ProjectBoardSignals } from "../api";
import { BoardSignalChips } from "./board-signal-chips";

const mocks = vi.hoisted(() => ({ signals: vi.fn() }));

vi.mock("../api", () => ({
  useProjectBoardSignals: (projectId: string | undefined) =>
    mocks.signals(projectId),
}));
vi.mock("@/lib/i18n", () => ({ i18n: { resolvedLanguage: "es-ES" } }));

const NOW = new Date("2026-11-05T10:00:00Z");
const MINUTE = 60_000;

const i18n = i18next.createInstance();
await i18n.use(initReactI18next).init({
  lng: "es-ES",
  resources: { "es-ES": { tasks: es.tasks } },
  interpolation: { escapeValue: false },
});

const task = { id: "task-1", projectId: "project-1" };
const timezone = process.env.TZ;

const WORKER = {
  estado: "activo",
  instancia: "agent:coder-1",
  rol: "role:coder",
  ultima_senal: "2026-11-05T09:58:00.000Z",
  trabajando: true,
} as const;

function signals(
  signal: Partial<BoardSignalTask> | undefined,
  calculatedAgoMs = MINUTE,
): { data: ProjectBoardSignals } {
  return {
    data: {
      calculado_en: new Date(
        NOW.getTime() - calculatedAgoMs,
      ).toISOString() as never,
      columnas: {},
      tareas: signal
        ? {
            [task.id]: {
              alarma: null,
              espera_a: null,
              worker: null,
              ...signal,
            },
          }
        : {},
    },
  };
}

function renderChips() {
  return render(
    <I18nextProvider i18n={i18n}>
      <BoardSignalChips task={task} />
    </I18nextProvider>,
  );
}

beforeAll(() => {
  process.env.TZ = "Europe/Madrid";
});

afterAll(() => {
  process.env.TZ = timezone;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("BoardSignalChips", () => {
  it("shows nothing for a task the factory said nothing about", () => {
    mocks.signals.mockReturnValue(signals(undefined));
    const { container } = renderChips();
    expect(container).toBeEmptyDOMElement();
    mocks.signals.mockReturnValue({ data: undefined });
    expect(renderChips().container).toBeEmptyDOMElement();
  });

  it("shows a live worker, working, with its instance and last sign of life", () => {
    mocks.signals.mockReturnValue(signals({ worker: WORKER }));
    renderChips();
    const chip = screen.getByRole("img", { name: "Worker vivo" });
    expect(chip).toHaveAttribute("data-worker-state", "activo");
    expect(chip).toHaveTextContent("Vivo");
    expect(chip).toHaveClass("text-success-foreground");
    expect(chip).toHaveAttribute(
      "title",
      "Worker vivo Trabajando ahora. agent:coder-1 (role:coder). Última señal de vida el 5 nov, 10:58.",
    );
  });

  it("shows a down worker in red, and a finished one muted", () => {
    mocks.signals.mockReturnValue(
      signals({ worker: { ...WORKER, estado: "caido", trabajando: false } }),
    );
    renderChips();
    const down = screen.getByRole("img", {
      name: "Worker caído: sin señal de vida en 30 min",
    });
    expect(down).toHaveClass("text-due-overdue");
    expect(down.querySelector(".lucide-bot-off")).not.toBeNull();
    cleanup();

    mocks.signals.mockReturnValue(
      signals({
        worker: { ...WORKER, estado: "terminado", trabajando: false },
      }),
    );
    renderChips();
    expect(
      screen.getByRole("img", { name: "Worker terminado" }),
    ).toHaveTextContent("Terminado");
  });

  it("hides the worker when the factory's report is older than 10 minutes", () => {
    mocks.signals.mockReturnValue(signals({ worker: WORKER }, 11 * MINUTE));
    expect(renderChips().container).toBeEmptyDOMElement();
  });

  it("shows the alarm with its reason and who the task waits for", () => {
    mocks.signals.mockReturnValue(
      signals(
        {
          alarma: { cuando: "2026-11-05T14:00:00.000Z", motivo: "release" },
          espera_a: "person:jaime",
        },
        30 * MINUTE,
      ),
    );
    renderChips();
    const alarm = screen.getByRole("img", { name: "Alarma el 5 nov, 15:00" });
    expect(alarm).toHaveTextContent("5 nov, 15:00");
    expect(alarm).toHaveAttribute(
      "title",
      "Alarma el 5 nov, 15:00 · release · Espera a person:jaime",
    );
  });

  it("without an alarm, says who a blocked task waits for", () => {
    mocks.signals.mockReturnValue(signals({ espera_a: "SF-9" }));
    renderChips();
    expect(
      screen.getByRole("img", { name: "Espera a SF-9" }),
    ).toHaveTextContent("SF-9");
  });
});
