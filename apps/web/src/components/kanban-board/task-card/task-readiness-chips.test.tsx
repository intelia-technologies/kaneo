import { cleanup, render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type Task from "@/types/task";
import { TaskReadinessChips } from "./task-readiness-chips";

const i18n = i18next.createInstance();
await i18n.use(initReactI18next).init({
  lng: "es",
  resources: { es: { tasks: {} } },
  interpolation: { escapeValue: false },
});
afterEach(cleanup);

const summary = {
  pendingCount: 0,
  hasCancelledBlocker: false,
  waitingRelease: false,
  blockers: [],
  externalCount: 0,
};
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
  it("shows visible blockers and only an anonymous external count", () => {
    show({
      blockersSummary: {
        ...summary,
        pendingCount: 2,
        blockers: [{ id: "1", ticket: "SF-123", status: "in-progress" }],
        externalCount: 1,
      },
    });
    expect(
      screen.getByText("Espera a SF-123 y 1 de otro proyecto"),
    ).toBeTruthy();
  });
  it("prioritizes a cancelled blocker over release", () => {
    show({
      blockersSummary: {
        ...summary,
        pendingCount: 1,
        hasCancelledBlocker: true,
        waitingRelease: true,
        blockers: [{ id: "1", ticket: "SF-123", status: "cancelled" }],
      },
    });
    expect(screen.getByText("Bloqueante cancelado: SF-123")).toBeTruthy();
    expect(screen.queryByText("Espera release")).toBeNull();
  });
  it("shows release waiting and hides dependency chips for completed tasks", () => {
    const result = show({
      type: "validacion",
      blockersSummary: { ...summary, waitingRelease: true },
    });
    expect(screen.getByText("Espera release")).toBeTruthy();
    result.unmount();
    show(
      {
        type: "validacion",
        blockersSummary: { ...summary, waitingRelease: true },
      },
      true,
    );
    expect(screen.getByText("val")).toBeTruthy();
    expect(screen.queryByText("Espera release")).toBeNull();
  });
  it("does not show a dependency chip when ready", () => {
    const { container } = show({ blockersSummary: summary });
    expect(container.textContent).toBe("");
  });
});
