import type { Context, Next } from "hono";
import type {
  AutomationChange,
  AutomationValue,
  AutomationWriter,
} from "./service";

// Upstream's API test suite and CI smoke create tasks without Intelia's field;
// they set this to "true". Never set in a deployment (design 18 §3, decision
// 7: no default level). It changes requests, not the schema: the published
// contract and its types do not depend on it.
export const AUTOMATION_OPTIONAL_ENV = "INTELIA_TASK_AUTOMATION_OPTIONAL";

/**
 * Middleware of `POST /api/task/{projectId}` and `POST /api/task/import/
 * {projectId}`, before body validation: with the test exception on, a JSON
 * body without `automation` gets `manual` with verification. Otherwise it
 * does nothing and the body schema rejects it.
 */
export async function testAutomationDefault(c: Context, next: Next) {
  if (process.env[AUTOMATION_OPTIONAL_ENV] !== "true") return next();
  // Earlier middleware has already read and cached the body: read it the same
  // way, then hand the validator a new request with an empty cache.
  const body: unknown = await c.req.json().catch(() => undefined);
  if (body && typeof body === "object" && !("automation" in body)) {
    c.req.raw = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers: c.req.raw.headers,
      body: JSON.stringify({
        ...body,
        automation: { level: "manual", verification: true },
      }),
    });
    c.req.bodyCache = {};
  }
  return next();
}

/** Whoever makes the request writes the level: a session or an API key. */
export function callerWriter(c: Context): AutomationWriter {
  return {
    source: c.get("apiKey") ? "api_key" : "session",
    userId: c.get("userId"),
  };
}

/**
 * The validated `automation` of `POST /api/task/{projectId}` (and the import),
 * signed by whoever creates the task (session or API key: the creator may
 * always set the first level). Upstream's createTask writes it in the task's
 * own transaction.
 */
export function automationOnCreateBy(
  c: Context,
  value: AutomationValue,
): AutomationChange {
  return { value, writer: callerWriter(c) };
}
