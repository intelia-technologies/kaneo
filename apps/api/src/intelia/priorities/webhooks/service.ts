import { and, asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import { ApiError } from "../../../errors/api-error";
import { assertPublicWebhookDestination } from "../../../plugins/generic-webhook/config";
import { priorityWebhookTable } from "../../schema";
import type { CreatePriorityWebhookInput } from "./schema";

type Row = typeof priorityWebhookTable.$inferSelect;

// What the API shows of a destination: never its secret.
function visible({ secret, ...row }: Row) {
  return { ...row, hasSecret: secret !== null };
}

function isUniqueViolation(error: unknown): boolean {
  for (let e = error; e && typeof e === "object";) {
    if ("code" in e && e.code === "23505") return true;
    e = "cause" in e ? e.cause : undefined;
  }
  return false;
}

export async function listPriorityWebhooks(workspaceId: string) {
  const rows = await db
    .select()
    .from(priorityWebhookTable)
    .where(eq(priorityWebhookTable.workspaceId, workspaceId))
    .orderBy(asc(priorityWebhookTable.createdAt), asc(priorityWebhookTable.id));
  return { webhooks: rows.map(visible) };
}

export async function createPriorityWebhook(
  workspaceId: string,
  input: CreatePriorityWebhookInput,
  userId: string,
) {
  try {
    await assertPublicWebhookDestination(input.url);
  } catch {
    throw new ApiError(400, {
      message: "The destination must be a public http or https address",
      code: "PRIORITY_WEBHOOK_DESTINATION",
    });
  }
  try {
    const [row] = await db
      .insert(priorityWebhookTable)
      .values({
        workspaceId,
        url: input.url,
        secret: input.secret ?? null,
        createdByUserId: userId,
      })
      .returning();
    if (!row) throw new Error("Priority webhook was not created");
    return visible(row);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    throw new ApiError(409, {
      message: "The workspace already sends priorities to that URL",
      code: "PRIORITY_WEBHOOK_TAKEN",
    });
  }
}

export async function deletePriorityWebhook(
  workspaceId: string,
  priorityWebhookId: string,
) {
  const [row] = await db
    .delete(priorityWebhookTable)
    .where(
      and(
        eq(priorityWebhookTable.id, priorityWebhookId),
        eq(priorityWebhookTable.workspaceId, workspaceId),
      ),
    )
    .returning();
  if (!row) {
    throw new HTTPException(404, { message: "Priority webhook not found" });
  }
  return visible(row);
}
