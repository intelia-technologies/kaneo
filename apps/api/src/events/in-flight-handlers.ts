// Handler runs started by publishEvent and not yet settled. publishEvent stays
// fire-and-forget; this only lets a caller wait for that work to finish. It is
// its own module so tests that mock "../events" can still drain it.
const inFlightHandlers = new Set<Promise<void>>();

export function trackEventHandler(run: Promise<void>): Promise<void> {
  inFlightHandlers.add(run);
  void run.finally(() => inFlightHandlers.delete(run));
  return run;
}

/**
 * Resolves once no event handler is running, including handlers started by
 * events that other handlers publish while this waits. The integration tests
 * call it before resetting the database so a previous test's handler cannot
 * write during or after the TRUNCATE.
 */
export async function drainEventHandlers(): Promise<void> {
  while (inFlightHandlers.size > 0) {
    await Promise.all(inFlightHandlers);
  }
}
