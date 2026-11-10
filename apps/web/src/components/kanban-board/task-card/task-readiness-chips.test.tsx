import { cleanup, render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  readyButPaused,
  summaryByReason,
  waitingOnPerson,
} from "@/intelia/wait/sample.test-data";
import type Task from "@/types/task";
import type { BlockersSummary } from "@/types/task/blockers-summary";
import { TaskReadinessChips } from "./task-readiness-chips";

const i18n = i18next.createInstance();
await i18n.use(initReactI18next).init({
  lng: "es",
  resources: { es: { tasks: {} } },
  interpolation: { escapeValue: false },
});
afterEach(cleanup);

const summary: BlockersSummary = summaryByReason.ready;
const blocker = (ticket: string, status: string) => ({
  id: ticket,
  ticket,
  status,
  title: ticket,
  state: "in_progress" as const,
  person: null,
});

function show(changes: Partial<Task>, completed = false) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TaskReadinessChips
        task={{ id: "1", ...changes } as Task}
        completed={completed}
      />
    </I18nextProvider>,
  );
}

function waitChip(container: HTMLElement) {
  return container.querySelector<HTMLElement>("[data-wait-reason]");
}

describe("TaskReadinessChips", () => {
  it.each([
    ["implementacion", "impl"],
    ["validacion", "val"],
    ["operacion", "oper"],
    ["diseno", "dis"],
  ] as const)("shows %s type", (type, label) => {
    show({ type });
    expect(screen.getByText(label)).toBeTruthy();
  });
  it.each([null, undefined])(
    "shows unclassified type %s for active and completed tasks",
    (type) => {
      const active = show({ type });
      expect(screen.getByText("sin tipo")).toBeTruthy();
      active.unmount();
      show({ type }, true);
      expect(screen.getByText("sin tipo")).toBeTruthy();
    },
  );
});

describe("TaskReadinessChips in To do (design 55 §3.2)", () => {
  it.each([
    ["cancelled", "Bloqueante cancelado: KF-10", "bg-red-100"],
    ["person", "Espera a una persona: KF-3, KF-2", "bg-red-100"],
    ["blocked", "Bloqueante bloqueado: KF-11", "bg-yellow-100"],
    ["not_started", "Bloqueante sin empezar: KF-12", "bg-yellow-100"],
    ["external", "Espera a otro proyecto: 1 de otro proyecto", "bg-yellow-100"],
    ["in_progress", "Bloqueante en curso: KF-13", "bg-blue-100"],
    ["ready", "Lista para empezar", "bg-green-100"],
  ] as const)("paints %s with its label and colour", (reason, label, tone) => {
    const { container } = show({
      status: "to-do",
      blockersSummary: summaryByReason[reason],
    });
    const chip = waitChip(container);
    expect(chip?.dataset.waitReason).toBe(reason);
    expect(chip?.textContent).toBe(label);
    expect(chip?.className).toContain(tone);
  });

  it("says why a ready task will not start alone", () => {
    const { container } = show({
      status: "to-do",
      blockersSummary: readyButPaused,
    });
    expect(waitChip(container)?.textContent).toBe(
      "Lista para empezar · pausada (movida_a_mano)",
    );
  });

  it("hides the wait chip for completed tasks", () => {
    const { container } = show(
      { status: "to-do", blockersSummary: waitingOnPerson },
      true,
    );
    expect(waitChip(container)).toBeNull();
  });
});

describe("TaskReadinessChips outside To do stays as before", () => {
  it("shows visible blockers and only an anonymous external count", () => {
    const { container } = show({
      status: "in-progress",
      blockersSummary: {
        ...summary,
        pendingCount: 2,
        blockers: [blocker("SF-123", "in-progress")],
        externalCount: 1,
      },
    });
    expect(
      screen.getByText("Espera a SF-123 y 1 de otro proyecto"),
    ).toBeTruthy();
    expect(waitChip(container)).toBeNull();
  });
  it("prioritizes a cancelled blocker over release", () => {
    show({
      status: "backlog",
      blockersSummary: {
        ...summary,
        pendingCount: 1,
        hasCancelledBlocker: true,
        waitingRelease: true,
        blockers: [blocker("SF-123", "cancelled")],
      },
    });
    expect(screen.getByText("Bloqueante cancelado: SF-123")).toBeTruthy();
    expect(screen.queryByText("Espera release")).toBeNull();
  });
  it("shows release waiting and hides dependency chips for completed tasks", () => {
    const result = show({
      status: "in-review",
      type: "validacion",
      blockersSummary: { ...summary, waitingRelease: true },
    });
    expect(screen.getByText("Espera release")).toBeTruthy();
    result.unmount();
    show(
      {
        status: "done",
        type: "validacion",
        blockersSummary: { ...summary, waitingRelease: true },
      },
      true,
    );
    expect(screen.getByText("val")).toBeTruthy();
    expect(screen.queryByText("Espera release")).toBeNull();
  });
  it("does not show a dependency chip when ready", () => {
    show({ status: "backlog", type: "diseno", blockersSummary: summary });
    expect(screen.getByText("dis")).toBeTruthy();
    expect(screen.queryByText(/Espera|Lista/)).toBeNull();
  });
});
