import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { HttpError } from "@/lib/http-error";
import { cancelTaskWithDependents } from "./api";
import { sampleResultSf2491, sampleSf2491 } from "./samples.test-data";

const fetchMock = vi.fn();
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function reply(status: number, body: unknown) {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValueOnce(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
    }),
  );
}

describe("cancelTaskWithDependents", () => {
  it("returns the chain of a 409 DEPENDENCIAS_SIN_RESOLVER", async () => {
    reply(409, sampleSf2491);

    await expect(cancelTaskWithDependents("t1", {})).resolves.toEqual({
      status: "unresolved",
      error: sampleSf2491,
    });
  });

  it("returns the result of a 200", async () => {
    reply(200, sampleResultSf2491);

    await expect(
      cancelTaskWithDependents("t1", { motivo: "Motivo suficiente" }),
    ).resolves.toEqual({ status: "cancelled", result: sampleResultSf2491 });
  });

  it("throws on any other 409, such as a cycle or a malformed body", async () => {
    reply(409, { error: "CYCLIC_DEPENDENCY", message: "Ciclo" });
    await expect(cancelTaskWithDependents("t1", {})).rejects.toBeInstanceOf(
      HttpError,
    );

    reply(409, "not json");
    await expect(cancelTaskWithDependents("t1", {})).rejects.toMatchObject({
      status: 409,
    });
  });
});
