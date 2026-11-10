import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  FilterSubject,
  TaskFilterControls,
} from "@/components/project/task-filters/filter-subject";
import type Task from "@/types/task";
import { useAutomationFilterSubject } from "./filter-subject";

const mocks = vi.hoisted(() => ({ automation: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./i18n", () => ({}));
vi.mock("./api", () => ({
  useProjectAutomation: () => ({ data: mocks.automation() }),
}));

const tasks = ["a", "b", "c", "d", "e"].map((id) => ({ id }) as Task);
const controls = {
  filters: { automation: ["paused"] },
  toggleFilter: vi.fn(),
  updateFilter: vi.fn(),
} as unknown as TaskFilterControls;

function subject() {
  return renderHook(() =>
    useAutomationFilterSubject({
      projectId: "p1",
      controls,
      tasks,
      build: (id, fields) => ({ id, ...fields }) as FilterSubject,
    }),
  ).result.current;
}

describe("useAutomationFilterSubject", () => {
  it("offers automatic, manual, paused and no automation, with their counts", () => {
    mocks.automation.mockReturnValue(
      new Map([
        ["a", { automatica: true, pausaMotivo: null }],
        ["b", { automatica: true, pausaMotivo: null }],
        ["c", { automatica: false, pausaMotivo: null }],
        ["d", { automatica: false, pausaMotivo: "movida_a_mano" }],
      ]),
    );

    const { options, selected } = subject();

    expect(options).toEqual([
      {
        value: "automatica",
        label: "intelia:automation.filterValues.automatica",
        count: 2,
      },
      {
        value: "manual",
        label: "intelia:automation.filterValues.manual",
        count: 1,
      },
      {
        value: "paused",
        label: "intelia:automation.filterValues.paused",
        count: 1,
      },
      {
        value: "none",
        label: "intelia:automation.filterValues.none",
        count: 1,
      },
    ]);
    expect(selected).toEqual(["paused"]);
  });

  it("counts nothing until the project's automation is loaded", () => {
    mocks.automation.mockReturnValue(undefined);

    expect(subject().options.map((option) => option.count)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
