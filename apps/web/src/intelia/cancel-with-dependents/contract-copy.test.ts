import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

// The CD-01 contract and samples, copied byte for byte from software-factory
// (commit 6bea2c5a08fa). If CD-01 changes, copy them again and update these.
const COPIES: Record<string, string> = {
  "cancelar-con-dependientes.ts":
    "6c879b44c48926b1774dc0d1fcbb3c58163436b435201d928535e38ef997a9fe",
  "muestras/esquema.json":
    "866bf4fe2d663085982ef9540e6d1fa35e10ae78dcaef9c474a5c6ceca5baaf1",
  "muestras/error-infra-381.json":
    "532f5a9179026e22a3555bac7866fb23a1f4f2157a5fbc97c090d90712dff494",
  "muestras/error-permiso.json":
    "f67cbbe033d9bac965d8553be7d349a793c2db0232138789cb3536b46d947cd5",
  "muestras/error-problemas-a.json":
    "f335a7eb873d65af5ce46e46458ee82debc5c51f0b7370505cd7fbdbe6d4d76c",
  "muestras/error-problemas-b.json":
    "3b3dfd22febc0fe9d7489a9b34d69eea79e9d3eb7bcadce1999d69486a14d275",
  "muestras/error-sf-2371.json":
    "22de4d50f543b3914c1c2ba9ddd950f89acc964d3f0dd0b6fa7a2506ebd46be1",
  "muestras/error-sf-2491.json":
    "4e6a5087af67b2c7ab576b9d0c85128d665e0b6f8688961499146fa9e6d470f7",
  "muestras/evento-sf-2491.json":
    "5551ff6fc702eaa064589272a896438cfc5ec0e48a9b408a9676709778100508",
  "muestras/peticion-sf-2491.json":
    "ca0c43e06341bce4d6a3c2dff4a404bf6c0c8d8f12843f24f6bee61245f0617b",
  "muestras/resultado-sf-2491.json":
    "4099146fc8e73464ff574422285a1cb81b9cf32bfcad47603d04506f24066abe",
};

describe("CD-01 contract copy", () => {
  it.each(Object.entries(COPIES))("%s is the verbatim copy", (file, sha) => {
    const bytes = readFileSync(path.join(__dirname, "contract", file));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha);
  });
});
