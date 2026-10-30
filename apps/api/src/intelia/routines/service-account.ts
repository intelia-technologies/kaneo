import { and, eq, ne, or, type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import db from "../../database";
import {
  accountTable,
  apikeyTable,
  sessionTable,
  teamMemberTable,
  userTable,
  workspaceMemberAccessTable,
  workspaceMemberProjectTable,
  workspaceUserTable,
} from "../../database/schema";
import { nonAnonymousUser } from "../../utils/instance-bootstrap";

// The account the scheduler signs as when it reopens a task. It is identified
// only by this fixed id; the email is reserved for it.
export const ROUTINE_SERVICE_ID = "svc-rutinas";
export const ROUTINE_SERVICE_NAME = "svc-rutinas";
export const ROUTINE_SERVICE_EMAIL = "svc-rutinas@inteliatech.internal";

async function exists(table: PgTable, where: SQL | undefined) {
  const [row] = await db
    .select({ one: sql`1` })
    .from(table)
    .where(where)
    .limit(1);
  return row !== undefined;
}

// Ensures the service account and checks its invariants on every tick.
// Returns null when the scheduler may sign as it, otherwise why it may not;
// the caller then reopens nothing (fail closed). It never adopts or changes a
// user other than its own, and is only created once a person has signed up,
// so it never takes the first person's place as instance administrator.
export async function routineServiceAccountProblem(): Promise<string | null> {
  if (
    await exists(
      userTable,
      and(
        sql`lower(${userTable.email}) = ${ROUTINE_SERVICE_EMAIL}`,
        ne(userTable.id, ROUTINE_SERVICE_ID),
      ),
    )
  ) {
    return `${ROUTINE_SERVICE_EMAIL} belongs to another user`;
  }

  const find = () =>
    db
      .select()
      .from(userTable)
      .where(eq(userTable.id, ROUTINE_SERVICE_ID))
      .limit(1);
  let [account] = await find();
  if (!account) {
    if (
      !(await exists(
        userTable,
        and(nonAnonymousUser, ne(userTable.id, ROUTINE_SERVICE_ID)),
      ))
    ) {
      return `${ROUTINE_SERVICE_ID} is only created once a person has signed up`;
    }
    await db
      .insert(userTable)
      .values({
        id: ROUTINE_SERVICE_ID,
        name: ROUTINE_SERVICE_NAME,
        email: ROUTINE_SERVICE_EMAIL,
        emailVerified: true,
        banned: true,
        banReason: "Service account for scheduled routines; cannot sign in",
      })
      .onConflictDoNothing();
    [account] = await find();
    if (!account) return `${ROUTINE_SERVICE_ID} could not be created`;
  }

  if (account.email !== ROUTINE_SERVICE_EMAIL) {
    return `${ROUTINE_SERVICE_ID} has another email`;
  }
  if (account.banned !== true || account.banExpires !== null) {
    return `${ROUTINE_SERVICE_ID} is not permanently banned`;
  }
  const id = ROUTINE_SERVICE_ID;
  const links: Array<[string, PgTable, SQL | undefined]> = [
    ["a sign-in account", accountTable, eq(accountTable.userId, id)],
    ["a session", sessionTable, eq(sessionTable.userId, id)],
    [
      "an API key",
      apikeyTable,
      or(eq(apikeyTable.referenceId, id), eq(apikeyTable.userId, id)),
    ],
    [
      "a workspace membership",
      workspaceUserTable,
      eq(workspaceUserTable.userId, id),
    ],
    [
      "a workspace access grant",
      workspaceMemberAccessTable,
      eq(workspaceMemberAccessTable.userId, id),
    ],
    [
      "a project membership",
      workspaceMemberProjectTable,
      eq(workspaceMemberProjectTable.userId, id),
    ],
    ["a team membership", teamMemberTable, eq(teamMemberTable.userId, id)],
  ];
  for (const [what, table, where] of links) {
    if (await exists(table, where)) return `${id} has ${what}`;
  }
  return null;
}
