/** Whether a database error (or one it wraps) is a unique violation. */
export function isUniqueViolation(error: unknown): boolean {
  for (let e = error; e && typeof e === "object";) {
    if ("code" in e && e.code === "23505") return true;
    e = "cause" in e ? e.cause : undefined;
  }
  return false;
}
