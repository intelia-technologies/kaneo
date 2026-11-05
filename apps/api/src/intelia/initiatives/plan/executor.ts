export const EXECUTOR_KINDS = ["ephemeral", "persistent", "person"] as const;
export type ExecutorKind = (typeof EXECUTOR_KINDS)[number];

// The factory's accounts (software-factory, design 00 §5): an ephemeral agent
// works with its role's account (`role-<slug>@`), a persistent one with its
// own (`agent-<slug>@`), and services (`svc-…@`) are machines too; all of them
// under this domain. Any other account is a person.
const FACTORY_DOMAIN = "@inteliatech.internal";

/** Who works a task, from its assignee's email; null when unassigned. */
export function executorKind(email: string | null): ExecutorKind | null {
  if (!email) return null;
  const address = email.trim().toLowerCase();
  if (!address.endsWith(FACTORY_DOMAIN)) return "person";
  return address.startsWith("role-") ? "ephemeral" : "persistent";
}
