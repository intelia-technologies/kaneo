import { cleanup, render } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  readyButPaused,
  summaryByReason,
  waitingOnPerson,
} from "../sample.test-data";
import type { BlockersSummary } from "@/types/task/blockers-summary";
import { WaitDetail } from "./wait-detail";

const i18n = i18next.createInstance();
await i18n.use(initReactI18next).init({
  lng: "es",
  resources: { es: { tasks: {} } },
  interpolation: { escapeValue: false },
});
afterEach(cleanup);

function lines(summary: BlockersSummary) {
  const { container } = render(
    <I18nextProvider i18n={i18n}>
      <WaitDetail summary={summary} />
    </I18nextProvider>,
  );
  return [...container.querySelectorAll("p, li")].map(
    (node) => node.textContent,
  );
}

describe("WaitDetail", () => {
  it("lists each blocker with its state, whom it waits for, and the root", () => {
    expect(lines(waitingOnPerson)).toEqual([
      "Espera a una persona: KF-3, KF-2",
      "KF-3 Decidir colores · espera a una persona: person:pablo",
      "KF-2 Resumen en la API · en curso",
      "Raíz: KF-4 Aprobar diseño · espera a una persona: Jaime · nivel 2",
    ]);
  });

  it("counts blockers of hidden projects without naming them", () => {
    expect(lines(summaryByReason.external)).toEqual([
      "Espera a otro proyecto: 1 de otro proyecto",
      "1 de otro proyecto",
      "Raíz: otro proyecto",
    ]);
  });

  it("says when the chain is a cycle", () => {
    expect(lines(summaryByReason.blocked)).toContain("Raíz: ciclo");
  });

  it("says why a ready task will not start alone", () => {
    expect(lines(readyButPaused)).toEqual([
      "Lista para empezar · pausada (movida_a_mano)",
      "No arrancará sola: pausada (movida_a_mano)",
    ]);
  });
});
