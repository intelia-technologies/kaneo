// The column where a task asked of a project waits (design 52 §3.2). It is
// first on the board but never a default: whatever picks "the first open
// column" must skip it. Mirrors apps/api/src/intelia/task-request/status.ts.
export const REQUESTED_STATUS = "pedida";

export const isRequestedStatus = (slug: string) => slug === REQUESTED_STATUS;
