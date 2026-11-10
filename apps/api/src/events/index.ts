import { AsyncLocalStorage } from "node:async_hooks";
import { EventEmitter } from "node:events";

const EVENTS = new EventEmitter();
EVENTS.setMaxListeners(100);
export const eventContext = new AsyncLocalStorage<{ initiatorId: string }>();

// Handler runs started by publishEvent and not yet settled. publishEvent stays
// fire-and-forget; this only lets a caller wait for that work to finish.
const inFlightHandlers = new Set<Promise<void>>();

export type EventPayload<T = unknown> = {
  type: string;
  data: T;
  timestamp: string;
};

export async function shutdownEventBus(): Promise<void> {
  EVENTS.removeAllListeners();
}

export async function publishEvent(
  eventType: string,
  data: unknown,
  options?: { waitForHandlers?: boolean },
): Promise<void> {
  let enhancedData = null;
  if (typeof data === "object" && data !== null) {
    const store = eventContext.getStore();
    enhancedData = { ...data, initiatorId: store?.initiatorId };
  }

  const payload: EventPayload = {
    type: eventType,
    data: enhancedData || data,
    timestamp: new Date().toISOString(),
  };

  try {
    if (options?.waitForHandlers) {
      // EventEmitter.emit discards promises. Bounded producers must await the
      // actual subscriber wrappers before starting their next item.
      for (const listener of EVENTS.listeners(eventType))
        await listener(payload);
    } else {
      EVENTS.emit(eventType, payload);
    }
  } catch (error) {
    console.error("Failed to publish event:", error);
    throw error;
  }
}

export async function subscribeToEvent<T>(
  eventType: string,
  handler: (data: T) => Promise<void>,
): Promise<void> {
  try {
    EVENTS.on(eventType, (payload: EventPayload<T>) => {
      const run = (async () => {
        try {
          await handler(payload.data);
        } catch (error) {
          console.error(`Error processing event ${eventType}:`, error);
        }
      })();
      inFlightHandlers.add(run);
      void run.finally(() => inFlightHandlers.delete(run));
      return run;
    });
  } catch (error) {
    console.error("Failed to subscribe to event:", error);
    throw error;
  }
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

process.on("SIGTERM", () => {
  shutdownEventBus().catch(console.error);
});
