import { describe, expect, it } from "vite-plus/test";
import { canonicalEstadoCompartido, estadoCompartidoSchema } from "./schema";

const valid = {
  nombre: "lab-h2",
  datos: "intelia",
  ficheros: true,
  tamano_max_gb: 50,
  servicios: "services:\n  db:\n    image: x\n",
};

describe("estadoCompartidoSchema", () => {
  it("keeps a valid value as given, compose text included", () => {
    expect(estadoCompartidoSchema.parse(valid)).toEqual(valid);
    for (const value of [
      { ...valid, datos: null },
      { ...valid, servicios: null },
      { ...valid, ficheros: false },
      { ...valid, nombre: "a", tamano_max_gb: 1 },
      { ...valid, nombre: "0".repeat(40), tamano_max_gb: 2000 },
    ]) {
      expect(estadoCompartidoSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects what the contract rejects", () => {
    const { nombre: _nombre, ...withoutName } = valid;
    for (const value of [
      null,
      "lab-h2",
      [],
      withoutName,
      { ...valid, semilla: "dump.sql" },
      { ...valid, nombre: "Lab" },
      { ...valid, nombre: "-lab" },
      { ...valid, nombre: "a".repeat(41) },
      { ...valid, nombre: "lab_h2" },
      { ...valid, datos: "sf" },
      { ...valid, ficheros: "true" },
      { ...valid, tamano_max_gb: 0 },
      { ...valid, tamano_max_gb: 2001 },
      { ...valid, tamano_max_gb: 1.5 },
      { ...valid, tamano_max_gb: "50" },
      { ...valid, servicios: "" },
      { ...valid, servicios: " \n " },
      { ...valid, servicios: 1 },
      { ...valid, ficheros: false, servicios: null },
    ]) {
      expect(
        estadoCompartidoSchema.safeParse(value).success,
        JSON.stringify(value),
      ).toBe(false);
    }
  });
});

describe("canonicalEstadoCompartido", () => {
  it("orders the keys so jsonb's reordering is not a change", () => {
    const reordered = {
      datos: valid.datos,
      nombre: valid.nombre,
      ficheros: valid.ficheros,
      servicios: valid.servicios,
      tamano_max_gb: valid.tamano_max_gb,
    } as const;
    expect(JSON.stringify(canonicalEstadoCompartido(reordered))).toBe(
      JSON.stringify(valid),
    );
    expect(canonicalEstadoCompartido(null)).toBeNull();
  });
});
