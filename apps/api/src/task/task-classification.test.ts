import { describe, expect, it } from "vite-plus/test";
import { createTaskBody, validTaskClassification } from "./schema";

describe("task classification", () => {
  it("accepts unclassified creates only without production declarations", () => {
    const body = {
      title: "Task",
      description: "",
      status: "planned",
      priority: "low",
      automation: { level: "manual", verification: true },
      initiative: { id: "initiative" },
    };
    expect(createTaskBody.safeParse(body).success).toBe(true);
    expect(createTaskBody.safeParse({ ...body, type: null }).success).toBe(
      true,
    );
    expect(
      createTaskBody.safeParse({ ...body, validationInProduction: "requerida" })
        .success,
    ).toBe(false);
    expect(
      createTaskBody.safeParse({ ...body, type: "implementacion" }).success,
    ).toBe(false);
  });
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
