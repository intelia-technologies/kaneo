import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { waitingOnPerson } from "../sample.test-data";
import { WaitChip } from "./wait-chip";

const i18n = i18next.createInstance();
await i18n.use(initReactI18next).init({
  lng: "es",
  resources: { es: { tasks: {} } },
  interpolation: { escapeValue: false },
});
afterEach(cleanup);

describe("WaitChip", () => {
  it("shows the blockers and the root on hover", async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <WaitChip summary={waitingOnPerson} />
      </I18nextProvider>,
    );
    const trigger = screen.getByText("Espera a una persona: KF-3, KF-2");
    fireEvent.pointerEnter(trigger.parentElement!, { pointerType: "mouse" });
    fireEvent.mouseEnter(trigger.parentElement!);
    fireEvent.mouseMove(trigger.parentElement!);
    expect(
      await screen.findByText(
        "KF-3 Decidir colores · espera a una persona: person:pablo",
        undefined,
        { timeout: 2000 },
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Raíz: KF-4 Aprobar diseño · espera a una persona: Jaime · nivel 2",
      ),
    ).toBeTruthy();
  });
});
