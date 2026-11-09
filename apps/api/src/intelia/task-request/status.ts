// The column where a task asked of a project waits for an answer (design 52
// §3.2). It is first on the board, before Backlog, but it is never a default:
// whatever picks "the first open column" (recurrence, moves, imports,
// integrations) must skip it, or new work would land as an unanswered request.
export const REQUESTED_STATUS = "pedida";
export const REQUESTED_COLUMN_NAME = "Pedida";

export const isRequestedStatus = (slug: string) => slug === REQUESTED_STATUS;
