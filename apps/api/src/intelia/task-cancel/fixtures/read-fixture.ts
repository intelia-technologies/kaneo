// Test helper: the CD-01 samples (software-factory `6bea2c5a08fa`,
// testing/contratos/muestras/cancelar-con-dependientes), copied as they are.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";

const here = dirname(fileURLToPath(import.meta.url));

export function readFixture<T = { tipo: string; valor: unknown }>(
  name: string,
): T {
  return JSON.parse(readFileSync(join(here, `${name}.json`), "utf8")) as T;
}

const esquema = readFixture<{ $id: string }>("esquema");
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(esquema);

/** Errors of `value` against `$defs/<def>` of `esquema.json`, or null. */
export function schemaErrors(def: string, value: unknown) {
  const validate = ajv.getSchema(`${esquema.$id}#/$defs/${def}`);
  if (!validate) throw new Error(`esquema.json has no $defs/${def}`);
  return validate(value) ? null : validate.errors;
}
