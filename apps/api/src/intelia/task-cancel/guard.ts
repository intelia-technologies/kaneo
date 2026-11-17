/**
 * `INTELIA_CANCEL_GUARD` (decision 19): off by default. Off, a cancellation
 * without `resoluciones` goes as before even with open dependents; on, it
 * gets the 409. Read on every call, so the cut is a restart with the variable.
 */
export function cancelGuardEnabled() {
  const value = process.env.INTELIA_CANCEL_GUARD?.trim().toLowerCase();
  return value === "1" || value === "true";
}
