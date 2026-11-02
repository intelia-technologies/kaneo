import type { Context } from "hono";
import type { AutomationChange, AutomationValue } from "./service";

/**
 * The validated `automation` of `POST /api/task/{projectId}`, signed by whoever
 * creates the task (session or API key: the creator may always set the first
 * level). Upstream's createTask writes it in the task's own transaction.
 */
export function automationOnCreateBy(
  c: Context,
  value: AutomationValue,
): AutomationChange {
  return {
    value,
    writer: {
      source: c.get("apiKey") ? "api_key" : "session",
      userId: c.get("userId"),
    },
  };
}
