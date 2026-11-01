import type { Context, Next } from "hono";
import { validationError } from "../../errors/validation-error";
import { z } from "../../openapi";
import { automationInput } from "./schema";
import { setAutomation } from "./service";

const createdTask = z.object({ id: z.string() });

// Upstream's test suites and CI smoke create tasks without Intelia's field;
// they set this to "true". Production never does (design 18 §3, decision 7).
export const AUTOMATION_OPTIONAL_ENV = "INTELIA_TASK_AUTOMATION_OPTIONAL";

/**
 * Middleware of upstream's `POST /api/task/{projectId}`: the body must carry
 * `automation: { level, verification }` (no default; `completa` requires
 * verification). Once upstream has created the task, the level is stored with
 * its first change-log row, by whoever created it (session or API key: the
 * creator may always set the first level).
 */
export async function requireAutomationOnCreate(c: Context, next: Next) {
  const body: unknown = await c.req.json().catch(() => undefined);
  const raw =
    body && typeof body === "object" && "automation" in body
      ? body.automation
      : undefined;
  if (raw === undefined && process.env[AUTOMATION_OPTIONAL_ENV] === "true") {
    return next();
  }
  const parsed = automationInput.safeParse(raw);
  if (!parsed.success) {
    throw validationError(
      parsed.error.issues.map((issue) => ({
        path: ["automation", ...issue.path],
        message:
          raw === undefined
            ? "Required: { level: manual | arranque | completa, verification: boolean }"
            : issue.message,
      })),
      "json",
    );
  }

  await next();
  if (c.res.status !== 200) return;
  // If this write fails the task stays without a level (500 to the caller);
  // the flow engine treats a task without a level as manual.
  const task = createdTask.parse(await c.res.clone().json());
  await setAutomation(task.id, parsed.data, {
    source: c.get("apiKey") ? "api_key" : "session",
    userId: c.get("userId"),
  });
}
