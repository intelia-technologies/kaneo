import { describe, expect, it } from "vite-plus/test";
import { archiveColumn } from "./archive-column";

const column = (slug: string, isFinal: boolean) => ({ slug, isFinal });

describe("archiveColumn", () => {
  it("prefers the final done column, else the first final one", () => {
    expect(
      archiveColumn([
        column("to-do", false),
        column("cancelled", true),
        column("done", true),
      ])?.slug,
    ).toBe("done");
    expect(
      archiveColumn([
        column("to-do", false),
        column("shipped", true),
        column("dropped", true),
      ])?.slug,
    ).toBe("shipped");
  });

  it("never picks an open column, even one called done", () => {
    expect(archiveColumn([column("done", false)])).toBeUndefined();
  });
});
