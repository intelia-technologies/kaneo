import { describe, expect, it } from "vite-plus/test";
import { validTaskClassification } from "./schema";

describe("task classification", () => {
  it.each(["implementacion", "operacion"] as const)(
    "requires a declaration for %s",
    (type) => {
      expect(validTaskClassification({ type })).toBe(false);
      expect(
        validTaskClassification({ type, validationInProduction: "requerida" }),
      ).toBe(true);
      expect(
        validTaskClassification({
          type,
          validationInProduction: "no_aplica",
          validationInProductionReason: "Covered by CI",
        }),
      ).toBe(true);
      expect(
        validTaskClassification({
          type,
          validationInProduction: "no_aplica",
          validationInProductionReason: "  ",
        }),
      ).toBe(false);
      expect(
        validTaskClassification({
          type,
          validationInProduction: "no_aplica",
          validationInProductionReason: "one\ntwo",
        }),
      ).toBe(false);
    },
  );
  it.each(["validacion", "diseno"] as const)(
    "does not allow recursive declarations on %s",
    (type) => {
      expect(validTaskClassification({ type })).toBe(true);
      expect(
        validTaskClassification({ type, validationInProduction: "requerida" }),
      ).toBe(false);
    },
  );
});
