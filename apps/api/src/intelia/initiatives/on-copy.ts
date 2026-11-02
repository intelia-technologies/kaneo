import db from "../../database";
import { ApiError } from "../../errors/api-error";
import type { Transaction } from "../task-automation/service";
import type { InitiativeWriter } from "./access";
import { initiativeIsOptional } from "./on-create";
import { assignOccurrence, assignOnCreate, taskInitiativeId } from "./service";

/**
 * How a manual copy (`POST /api/task/duplicate/{id}`) gets its initiative: the
 * one the request gives, else the source's. The caller signs it. A recurrence
 * occurrence has no request and passes `undefined`: it follows its template.
 */
export type CopyInitiative = {
  explicit: string | undefined;
  writer: InitiativeWriter;
};

function missingInitiative() {
  return new ApiError(400, {
    message:
      "The source task has no initiative; send `initiativeId` for the copy",
    code: "VALIDATION_ERROR",
    issues: [{ path: "body.initiativeId", message: "Required" }],
  });
}

/**
 * Before any asset is copied: a manual copy of a task without initiative needs
 * the request to give one (unless the test exception is on). Rechecked in the
 * transaction by `writeCopyInitiative`.
 */
export async function assertCopyInitiative(
  sourceTaskId: string,
  copy: CopyInitiative | undefined,
) {
  if (!copy || copy.explicit || initiativeIsOptional()) return;
  if (!(await taskInitiativeId(db, sourceTaskId))) throw missingInitiative();
}

/** Puts the copy in its initiative inside the duplicate's transaction. */
export async function writeCopyInitiative(
  tx: Transaction,
  sourceTaskId: string,
  task: { id: string; projectId: string; status: string },
  copy: CopyInitiative | undefined,
) {
  if (!copy) return assignOccurrence(tx, sourceTaskId, task);
  const initiativeId =
    copy.explicit ?? (await taskInitiativeId(tx, sourceTaskId));
  if (!initiativeId) {
    if (initiativeIsOptional()) return null;
    throw missingInitiative();
  }
  return assignOnCreate(tx, task, initiativeId, copy.writer);
}
