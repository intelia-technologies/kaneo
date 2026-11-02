import type { Context, Next } from "hono";
import { ensureTestInitiative } from "./service";

// Upstream's API test suite and CI smoke create tasks without Intelia's field;
// they set this to "true". Never set in a deployment (design 19 §3: the
// initiative is required). It changes requests, not the schema: the published
// contract and its types do not depend on it.
export const INITIATIVE_OPTIONAL_ENV = "INTELIA_TASK_INITIATIVE_OPTIONAL";

export function initiativeIsOptional() {
  return process.env[INITIATIVE_OPTIONAL_ENV] === "true";
}

async function fillBody(
  c: Context,
  field: "initiative" | "initiativeId",
  value: (initiativeId: string) => unknown,
) {
  // Earlier middleware has already read and cached the body: read it the same
  // way, then hand the validator a new request with an empty cache.
  const body: unknown = await c.req.json().catch(() => undefined);
  const projectId = c.req.param("projectId");
  if (!projectId || !body || typeof body !== "object" || field in body) return;
  c.req.raw = new Request(c.req.raw.url, {
    method: c.req.raw.method,
    headers: c.req.raw.headers,
    body: JSON.stringify({
      ...body,
      [field]: value(await ensureTestInitiative(projectId)),
    }),
  });
  c.req.bodyCache = {};
}

/**
 * Middleware of `POST /api/task/{projectId}`, before body validation: with the
 * test exception on, a JSON body without `initiative` gets the project's
 * test initiative. Otherwise it does nothing and the body schema rejects it.
 */
export async function testInitiativeDefault(c: Context, next: Next) {
  if (initiativeIsOptional()) await fillBody(c, "initiative", (id) => ({ id }));
  return next();
}

/** The same for `POST /api/task/import/{projectId}` and its `initiativeId`. */
export async function testImportInitiativeDefault(c: Context, next: Next) {
  if (initiativeIsOptional()) await fillBody(c, "initiativeId", (id) => id);
  return next();
}
