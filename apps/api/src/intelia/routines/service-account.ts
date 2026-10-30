import { eq } from "drizzle-orm";
import db from "../../database";
import { userTable } from "../../database/schema";

export const ROUTINE_SERVICE_EMAIL = "svc-rutinas@inteliatech.internal";
export const ROUTINE_SERVICE_NAME = "svc-rutinas";

// The account the scheduler signs as when it reopens a task. Created on the
// first tick after start-up, without credentials and banned: it cannot sign
// in, and banned users get no workspace grants, sessions or API keys. An
// existing account with this email is reused untouched.
export async function ensureRoutineServiceAccount(): Promise<string> {
  await db
    .insert(userTable)
    .values({
      id: ROUTINE_SERVICE_NAME,
      name: ROUTINE_SERVICE_NAME,
      email: ROUTINE_SERVICE_EMAIL,
      emailVerified: true,
      banned: true,
      banReason: "Service account for scheduled routines; cannot sign in",
    })
    .onConflictDoNothing();
  const [user] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, ROUTINE_SERVICE_EMAIL))
    .limit(1);
  if (!user) throw new Error(`${ROUTINE_SERVICE_EMAIL} could not be created`);
  return user.id;
}
