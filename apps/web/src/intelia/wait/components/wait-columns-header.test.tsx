import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { SortConfig } from "@/lib/sort-tasks";
import { WaitColumnsHeader } from "./wait-columns-header";

const i18n = i18next.createInstance();
await i18n.use(initReactI18next).init({
  lng: "es",
  resources: { es: { tasks: {} } },
  interpolation: { escapeValue: false },
});
afterEach(cleanup);

function clickHeader(sort: SortConfig, name: string) {
  const onSortChange = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <WaitColumnsHeader sort={sort} onSortChange={onSortChange} />
    </I18nextProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name }));
  return onSortChange.mock.calls[0]?.[0];
}

describe("WaitColumnsHeader", () => {
  it.each([
    ["Ordenar por Espera", "wait"],
    ["Ordenar por Raíz", "root"],
  ])("%s starts ascending", (name, field) => {
    expect(clickHeader({ field: "position", direction: "asc" }, name)).toEqual({
      field,
      direction: "asc",
    });
  });

  it("flips the direction of the active column", () => {
    expect(
      clickHeader({ field: "wait", direction: "asc" }, "Ordenar por Espera"),
    ).toEqual({ field: "wait", direction: "desc" });
    cleanup();
    expect(
      clickHeader({ field: "root", direction: "desc" }, "Ordenar por Raíz"),
    ).toEqual({ field: "root", direction: "asc" });
  });

  it("marks only the active column as pressed", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <WaitColumnsHeader
          sort={{ field: "root", direction: "asc" }}
          onSortChange={vi.fn()}
        />
      </I18nextProvider>,
    );
    expect(
      screen
        .getByRole("button", { name: "Ordenar por Raíz" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Ordenar por Espera" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
