import { describe, expect, it } from "vite-plus/test";
import { importTasksBody } from "./schema";

const task = { title: "Imported", status: "planned" };
const input = (entry: object) => ({
  tasks: [{ ...task, ...entry }],
  automation: { level: "manual", verification: true },
  initiativeId: "initiative",
});

describe("import task classification", () => {
  it("accepts missing or null types with or without an explicit fallback", () => {
    for (const entry of [{}, { type: null }]) {
      expect(importTasksBody.safeParse(input(entry)).success).toBe(true);
      expect(
        importTasksBody.safeParse({
          ...input(entry),
          classificationForUnclassified: { type: "validacion" },
        }).success,
      ).toBe(true);
    }
    expect(
      importTasksBody.safeParse(input({ type: "validacion" })).success,
    ).toBe(true);
  });

  it("validates both existing and fallback classifications", () => {
    expect(
      importTasksBody.safeParse(input({ validationInProduction: "requerida" }))
        .success,
    ).toBe(false);
    expect(
      importTasksBody.safeParse(input({ type: "implementacion" })).success,
    ).toBe(false);
    expect(
      importTasksBody.safeParse(
        input({ type: "operacion", validationInProduction: "no_aplica" }),
      ).success,
    ).toBe(false);
    expect(
      importTasksBody.safeParse(
        input({
          type: "operacion",
          validationInProduction: "no_aplica",
          validationInProductionReason: "Covered by CI",
        }),
      ).success,
    ).toBe(true);
    expect(
      importTasksBody.safeParse(
        input({ type: "diseno", validationInProduction: "requerida" }),
      ).success,
    ).toBe(false);
    expect(
      importTasksBody.safeParse({
        ...input({}),
        classificationForUnclassified: { type: "implementacion" },
      }).success,
    ).toBe(false);
    expect(
      importTasksBody.safeParse({
        ...input({}),
        classificationForUnclassified: {
          type: "operacion",
          validationInProduction: "requerida",
        },
      }).success,
    ).toBe(true);
  });
});
