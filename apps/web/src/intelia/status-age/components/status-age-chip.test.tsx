import es from "@i18n/es-ES.json";
import { act, cleanup, render, screen } from "@testing-library/react";
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
import useProjectStore from "@/store/project";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type { ProjectWithTasks } from "@/types/project";
import type { ProjectStatusAge } from "../api";
import { StatusAgeChip } from "./status-age-chip";

const mocks = vi.hoisted(() => ({ statusAge: vi.fn() }));

vi.mock("../api", () => ({
  useProjectStatusAge: (projectId: string | undefined) =>
    mocks.statusAge(projectId),
}));
vi.mock("@/lib/i18n", () => ({ i18n: { resolvedLanguage: "es-ES" } }));

const NOW = new Date("2026-11-02T20:00:00Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const P75 = 9 * 3600;
const P90 = 24 * 3600;

const i18n = i18next.createInstance();
await i18n.use(initReactI18next).init({
  lng: "es-ES",
  resources: { "es-ES": { tasks: es.tasks } },
  interpolation: { escapeValue: false },
});

const task = { id: "task-1", projectId: "project-1", status: "in-review" };
const timezone = process.env.TZ;

function statusAge(
  enteredAgoMs: number,
  column: ProjectStatusAge["columnas"][string] | undefined = {
    p75_s: P75,
    p90_s: P90,
    casos: 42,
  },
): { data: ProjectStatusAge } {
  return {
    data: {
      tareas: {
        [task.id]: new Date(NOW.getTime() - enteredAgoMs).toISOString(),
      },
      columnas: column ? { "in-review": column } : {},
      calculado_en: NOW.toISOString(),
    },
  };
}

function renderChip(props: Partial<Parameters<typeof StatusAgeChip>[0]> = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <StatusAgeChip task={task} {...props} />
    </I18nextProvider>,
  );
}

const chip = () => screen.getByRole("img");

beforeAll(() => {
  // Dates in the explanation follow the browser's zone (design 23 §5).
  process.env.TZ = "Europe/Madrid";
});

afterAll(() => {
  process.env.TZ = timezone;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(NOW);
  useUserPreferencesStore.setState({ showStatusAge: true });
  useProjectStore.setState({
    project: {
      columns: [{ slug: "in-review", name: "In review", isFinal: false }],
    } as unknown as ProjectWithTasks,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("StatusAgeChip", () => {
  it.each([
    [45 * MINUTE, "45 min"],
    [HOUR - 1000, "59 min"],
    [HOUR, "1 h"],
    [5 * HOUR, "5 h"],
    [48 * HOUR - 1000, "47 h"],
    [48 * HOUR, "2 d"],
    [3 * DAY + 5 * HOUR, "3 d"],
  ])("rounds %d ms in the column to «%s»", (ago, text) => {
    mocks.statusAge.mockReturnValue(statusAge(ago));
    renderChip();

    expect(chip()).toHaveTextContent(text);
  });

  it("stays neutral up to the column's p75", () => {
    mocks.statusAge.mockReturnValue(statusAge(P75 * 1000));
    renderChip();

    expect(chip()).toHaveAttribute("data-status-age-tone", "neutral");
    expect(chip()).toHaveAccessibleName("9 h en In review");
    expect(chip().querySelector(".lucide-clock")).not.toBeNull();
  });

  it("turns amber above the p75, with its icon and label", () => {
    mocks.statusAge.mockReturnValue(statusAge(P75 * 1000 + 1000));
    renderChip();

    expect(chip()).toHaveAttribute("data-status-age-tone", "above-p75");
    expect(chip()).toHaveClass("text-warning-foreground");
    expect(chip()).toHaveAccessibleName(
      "9 h en In review. Por encima de lo habitual en esta columna",
    );
    expect(chip().querySelector(".lucide-clock-alert")).not.toBeNull();
  });

  it("turns red above the p90, with its icon and label", () => {
    mocks.statusAge.mockReturnValue(statusAge(P90 * 1000 + 1000));
    renderChip();

    expect(chip()).toHaveAttribute("data-status-age-tone", "above-p90");
    expect(chip()).toHaveClass("text-due-overdue");
    expect(chip()).toHaveAccessibleName(
      "24 h en In review. Muy por encima de lo habitual en esta columna",
    );
    expect(chip().querySelector(".lucide-triangle-alert")).not.toBeNull();
  });

  it("explains the entry date in the browser's zone and the column's p75", () => {
    mocks.statusAge.mockReturnValue(
      statusAge(NOW.getTime() - Date.parse("2026-11-01T13:02:00Z")),
    );
    renderChip();

    expect(chip()).toHaveAttribute(
      "title",
      "En In review desde el 1 nov, 14:02. 3 de cada 4 tareas salen de esta columna en menos de 9 h (últimos 90 días, 42 casos).",
    );
  });

  it("has no colour and says why without percentiles", () => {
    mocks.statusAge.mockReturnValue(
      statusAge(30 * DAY, { p75_s: null, p90_s: null, casos: 6 }),
    );
    renderChip();

    expect(chip()).toHaveAttribute("data-status-age-tone", "neutral");
    expect(chip()).toHaveAccessibleName("30 d en In review");
    expect(chip().getAttribute("title")).toMatch(
      / Sin base para comparar: 6 casos en los últimos 90 días\.$/,
    );
  });

  it("has no colour in a column without any finished stay", () => {
    mocks.statusAge.mockReturnValue(statusAge(30 * DAY, null as never));
    renderChip();

    expect(chip()).toHaveAttribute("data-status-age-tone", "neutral");
    expect(chip().getAttribute("title")).toMatch(
      / Sin base para comparar: 0 casos en los últimos 90 días\.$/,
    );
  });

  it("shows nothing for tasks in Done or Cancelled", () => {
    // The API leaves them out of `tareas`.
    mocks.statusAge.mockReturnValue({
      data: { ...statusAge(HOUR).data, tareas: {} },
    });
    const { container } = renderChip();

    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing once the row knows the task is completed", () => {
    mocks.statusAge.mockReturnValue(statusAge(HOUR));
    const { container } = renderChip({ isCompleted: true });

    expect(container).toBeEmptyDOMElement();
    expect(mocks.statusAge).toHaveBeenCalledWith(undefined);
  });

  it("shows nothing and asks for nothing with the preference off", () => {
    useUserPreferencesStore.setState({ showStatusAge: false });
    mocks.statusAge.mockReturnValue(statusAge(HOUR));
    const { container } = renderChip();

    expect(container).toBeEmptyDOMElement();
    expect(mocks.statusAge).toHaveBeenCalledWith(undefined);
  });

  it("advances every minute without new data", () => {
    const data = statusAge(44 * MINUTE + 30_000);
    mocks.statusAge.mockReturnValue(data);
    renderChip();
    expect(chip()).toHaveTextContent("44 min");

    act(() => {
      vi.advanceTimersByTime(MINUTE);
    });

    expect(chip()).toHaveTextContent("45 min");
    expect(mocks.statusAge).toHaveBeenCalledWith("project-1");
    expect(new Set(mocks.statusAge.mock.results.map((r) => r.value))).toEqual(
      new Set([data]),
    );
  });
});
