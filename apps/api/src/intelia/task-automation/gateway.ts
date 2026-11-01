import { createHash, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { ApiError } from "../../errors/api-error";

// The factory's gateway writes the automation level with its own service
// token (design 18 §5, decision 9): it checks the agent's permission in the
// graph first, so Kaneo never calls the graph. The token only opens the
// automation routes below, nothing else in the API.
export const GATEWAY_TOKEN_ENV = "INTELIA_GATEWAY_TOKEN";
export const GATEWAY_TOKEN_HEADER = "x-service-token";
const MIN_TOKEN_LENGTH = 32;

const GATEWAY_PATHS =
  /^\/api\/intelia\/(?:task\/[^/]+\/automation(?:\/history)?|project\/[^/]+\/automation)$/;

/**
 * true when the request carries the gateway's service token on an automation
 * route; false when it carries none (or is not an automation route), so the
 * usual session or API key authentication applies. A wrong token, or any token
 * while none (or a short one) is configured, is a 401.
 */
export function isGatewayRequest(c: Context): boolean {
  const presented = c.req.header(GATEWAY_TOKEN_HEADER)?.trim();
  if (!presented || !GATEWAY_PATHS.test(c.req.path)) return false;
  const expected = process.env[GATEWAY_TOKEN_ENV]?.trim() ?? "";
  // Hashing gives timingSafeEqual inputs of the same length.
  const sha256 = (value: string) => createHash("sha256").update(value).digest();
  if (
    expected.length < MIN_TOKEN_LENGTH ||
    !timingSafeEqual(sha256(presented), sha256(expected))
  ) {
    throw new ApiError(401, {
      message: "Invalid service token",
      code: "UNAUTHORIZED",
    });
  }
  return true;
}
