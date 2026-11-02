import { eq } from "drizzle-orm";
import db from "../../database";
import { ApiError } from "../../errors/api-error";
import { taskAutomationTable } from "../schema";
import { AUTOMATION_OPTIONAL_ENV } from "./on-create";
import {
  type AutomationValue,
  type AutomationWriter,
  type Transaction,
  writeAutomation,
  writeAutomationAs,
} from "./service";

/**
 * How a manual copy (`POST /api/task/duplicate/{id}`) gets its level: the one
 * the request gives, else the source's own. The caller signs it. A recurrence
 * occurrence has no request and passes `undefined`: it follows its template.
 */
export type CopyAutomation = {
  explicit?: AutomationValue;
  writer: AutomationWriter;
};

// The level of a task whose level nobody chose (design 18 §3).
const BACKFILL_VALUE: AutomationValue = { level: "manual", verification: true };

function readAutomation(executor: typeof db | Transaction, taskId: string) {
  return executor
    .select()
    .from(taskAutomationTable)
    .where(eq(taskAutomationTable.taskId, taskId))
    .limit(1)
    .then(([row]) => row);
}

function missingLevel() {
  return new ApiError(400, {
    message:
      "The source task has no automation level: `automation` is required",
    code: "VALIDATION_ERROR",
    issues: [{ path: "body.automation", message: "Required" }],
  });
}

// The level of a manual copy, or null when there is none to give it.
async function resolveCopyValue(
  executor: typeof db | Transaction,
  sourceTaskId: string,
  { explicit }: CopyAutomation,
): Promise<AutomationValue | null> {
  if (explicit) return explicit;
  const source = await readAutomation(executor, sourceTaskId);
  if (source) {
    return { level: source.level, verification: source.verification };
  }
  // The test exception of task creation covers the copy of a level-less task.
  return process.env[AUTOMATION_OPTIONAL_ENV] === "true"
    ? BACKFILL_VALUE
    : null;
}

/**
 * Before any asset is copied: a manual copy of a task without level needs the
 * request to give one. Rechecked in the transaction by `writeCopyAutomation`.
 */
export async function assertCopyAutomation(
  sourceTaskId: string,
  copy: CopyAutomation | undefined,
) {
  if (!copy) return;
  if (!(await resolveCopyValue(db, sourceTaskId, copy))) throw missingLevel();
}

/**
 * Writes the copy's level and its change-log row inside the duplicate's
 * transaction: a failure rolls the copy back before `task.created` goes out.
 * An occurrence takes its template's level and keeps the template's writer;
 * a template without level gets the backfill rule, so the series keeps going.
 */
export async function writeCopyAutomation(
  tx: Transaction,
  sourceTaskId: string,
  copyTaskId: string,
  copy: CopyAutomation | undefined,
) {
  if (!copy) {
    const template = await readAutomation(tx, sourceTaskId);
    if (!template) {
      return writeAutomation(tx, copyTaskId, {
        value: BACKFILL_VALUE,
        writer: { source: "migration" },
      });
    }
    return writeAutomationAs(
      tx,
      copyTaskId,
      { level: template.level, verification: template.verification },
      {
        source: template.source,
        userId: template.setByUserId,
        actor: template.setByActor,
      },
    );
  }
  const value = await resolveCopyValue(tx, sourceTaskId, copy);
  if (!value) throw missingLevel();
  return writeAutomation(tx, copyTaskId, { value, writer: copy.writer });
}
