// The BC-01 samples (design 80 §7), byte for byte: software-factory
// testing/contratos/muestras/bloqueo-capacidad/ at commit
// c7e8802eef6e53ba52e431485aa5f56fb9b28c15 (PR #2602). Check with
// `git hash-object <file>` here and
// `git rev-parse c7e8802e:testing/contratos/muestras/bloqueo-capacidad/<file>`
// there. If BC-01 changes them, copy them again and update the blobs.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const SAMPLE_BLOBS = {
  "senales-tablero.json": "b0d16e56a2d64553bb13cac93238d85b5fd074fd",
  "automatizacion.json": "bce1e9337242bc3dcc42744a85b66870d600ee00",
} as const;

export type SampleFile = keyof typeof SAMPLE_BLOBS;

export function readSample(file: SampleFile) {
  return readFileSync(new URL(`./${file}`, import.meta.url));
}

export function gitBlobId(content: Buffer) {
  return createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}

export function sampleJson(file: SampleFile) {
  return JSON.parse(readSample(file).toString("utf8")) as Record<
    string,
    unknown
  >;
}
