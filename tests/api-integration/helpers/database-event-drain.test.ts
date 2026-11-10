import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../../apps/api/src/database";
import {
  drainEventHandlers,
  publishEvent,
  subscribeToEvent,
} from "../../../apps/api/src/events";
// Registers the real workspace.created → createNotification handler.
import "../../../apps/api/src/notification";
import { resetTestDatabase } from "./database";

type WorkspaceCreated = { workspaceId: string; ownerId?: string };

let slowHandlerEnabled = false;

async function truncateIsWaitingOnLock() {
  const result = await db.execute<{ waiting: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        AND query ILIKE 'truncate table%'
    ) AS waiting
  `);
  return result.rows[0]?.waiting === true;
}

// A workspace.created handler that takes locks in the opposite order to the
// reset, like the one behind the 40P01 in kaneo#64: it holds "notification"
// and then reads "account". The TRUNCATE locks tables alphabetically, so it
// holds "account" while it waits for "notification". The handler waits until
// the TRUNCATE is queued (or 500 ms, when the reset correctly waits for it).
await subscribeToEvent<WorkspaceCreated>(
  "workspace.created",
  async ({ ownerId }) => {
    if (!slowHandlerEnabled || !ownerId) return;
    await db.transaction(async (tx) => {
      await tx.insert(schema.notificationTable).values({
        id: createId(),
        userId: ownerId,
        type: "info",
      });
      const deadline = Date.now() + 500;
      while (Date.now() < deadline && !(await truncateIsWaitingOnLock())) {
        await sleep(10);
      }
      await tx.select().from(schema.accountTable).limit(1);
    });
  },
);

async function seedWorkspaceOwner() {
  const userId = `user-${randomUUID()}`;
  const workspaceId = `workspace-${randomUUID()}`;

  await db.insert(schema.userTable).values({
    id: userId,
    email: `${userId}@example.com`,
    emailVerified: true,
    name: "Drain Test Owner",
  });
  await db.insert(schema.workspaceTable).values({
    id: workspaceId,
    createdAt: new Date(),
    name: "Drain Workspace",
    slug: `workspace-${randomUUID()}`,
  });
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId,
    role: "owner",
    joinedAt: new Date(),
  });

  return { userId, workspaceId };
}

async function countNotifications() {
  const result = await db.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM notification`,
  );
  return result.rows[0]?.count ?? -1;
}

describe("resetTestDatabase with in-flight event handlers", () => {
  beforeEach(async () => {
    slowHandlerEnabled = false;
    await resetTestDatabase();
  });

  it("waits for workspace.created handlers the test did not await before truncating", async () => {
    const { userId, workspaceId } = await seedWorkspaceOwner();
    const errors = vi.spyOn(console, "error");
    const warnings = vi.spyOn(console, "warn");
    slowHandlerEnabled = true;

    // The test ends here without waiting, as tests that create a workspace do.
    void publishEvent("workspace.created", {
      workspaceId,
      workspaceName: "Drain Workspace",
      ownerEmail: `${userId}@example.com`,
      ownerId: userId,
    });

    await resetTestDatabase();
    // Lets any handler the reset left behind finish its late write.
    await drainEventHandlers();

    expect(await countNotifications()).toBe(0);
    expect(warnings).not.toHaveBeenCalledWith(
      expect.stringContaining("TRUNCATE deadlocked"),
    );
    expect(errors).not.toHaveBeenCalledWith(
      "Error processing event workspace.created:",
      expect.anything(),
    );
  });
});
