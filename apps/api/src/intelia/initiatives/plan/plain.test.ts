import { describe, expect, it } from "vite-plus/test";
import { plainParagraph } from "./plain";

describe("plainParagraph", () => {
  it("takes the opening «En llano» paragraph without its marker", () => {
    expect(
      plainParagraph(
        "**En llano.** Calcula las horas.\nY el fin.\n\n**Qué:** el resto",
      ),
    ).toBe("Calcula las horas.\nY el fin.");
    expect(plainParagraph("## Objetivo\n\n**En llano.** tarde")).toBeNull();
    expect(plainParagraph(null)).toBeNull();
    expect(plainParagraph(`**En llano.** ${"a".repeat(700)}`)).toHaveLength(
      600,
    );
  });
});
