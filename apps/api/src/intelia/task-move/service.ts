import { and, asc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { HTTPException } from "hono/http-exception";
import createActivities from "../../activity/controllers/create-activities";
import {
  isChoiceType,
  parseChoiceValue,
  readOptions,
} from "../../custom-field/choice-options";
import db from "../../database";
import {
  assetTable,
  columnTable,
  customFieldDefinitionTable,
  customFieldValueTable,
  externalLinkTable,
  integrationTable,
  labelTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { ApiError, type ApiErrorIssue } from "../../errors/api-error";
import { publishEvent } from "../../events";
import { assertProjectAccess } from "../../project-access/assert-project-access";
import { filterUsersWithProjectAccess } from "../../project-access/filter-users-with-project-access";
import { claimTaskNumber } from "../../task/controllers/claim-task-numbers";
import { nextTaskPosition } from "../../task/controllers/next-task-position";
import type { InitiativeWriter } from "../initiatives/access";
import {
  type MovedInitiative,
  moveTaskInitiative,
} from "../initiatives/service";
import { taskAliasTable } from "../schema";
import type { Transaction } from "../task-automation/service";

export type MoveRequest = {
  taskId: string;
  destinationProjectId: string;
  dryRun: boolean;
  /** Custom fields (by name) the caller accepts to lose. */
  discardFields: string[];
  writer: InitiativeWriter;
};

export type FieldPlan = {
  name: string;
  value: string | null;
  fromFieldId: string;
  toFieldId: string | null;
  action: "kept" | "discarded";
};

type TicketRef = {
  projectId: string;
  projectSlug: string;
  projectName: string;
  number: number | null;
  ticketId: string | null;
};

/** What a move did, or what it would do (dry run). */
export type MoveResult = {
  dryRun: boolean;
  taskId: string;
  from: TicketRef;
  to: TicketRef & { number: number; ticketId: string };
  column: {
    slug: string;
    name: string;
    fromColumnId: string | null;
    toColumnId: string;
  };
  customFields: FieldPlan[];
  labels: { name: string; action: "kept" }[];
  initiative: MovedInitiative | null;
  assignee: { userId: string | null; kept: boolean };
  kept: string[];
};

type AppliedMove = {
  result: MoveResult;
  event: { fromProjectName: string; toProjectName: string; oldStatus: string };
};

// Thrown inside the transaction to roll a dry run back after it has done
// everything a real move does.
class DryRunRollback extends Error {
  constructor(readonly result: MoveResult) {
    super("dry run");
  }
}

function nameKey(name: string) {
  return name.normalize("NFKC").trim().toLowerCase();
}

async function planCustomFields(
  tx: Transaction,
  taskId: string,
  destinationProjectId: string,
  discardFields: string[],
  issues: ApiErrorIssue[],
): Promise<FieldPlan[]> {
  const values = await tx
    .select({
      valueId: customFieldValueTable.id,
      value: customFieldValueTable.value,
      fieldId: customFieldDefinitionTable.id,
      name: customFieldDefinitionTable.name,
      type: customFieldDefinitionTable.type,
    })
    .from(customFieldValueTable)
    .innerJoin(
      customFieldDefinitionTable,
      eq(customFieldValueTable.fieldId, customFieldDefinitionTable.id),
    )
    .where(eq(customFieldValueTable.taskId, taskId))
    .orderBy(asc(customFieldDefinitionTable.position));
  if (values.length === 0) return [];

  const destinationFields = await tx
    .select()
    .from(customFieldDefinitionTable)
    .where(eq(customFieldDefinitionTable.projectId, destinationProjectId));
  const byName = new Map(
    destinationFields.map((field) => [nameKey(field.name), field]),
  );
  const discarded = new Set(discardFields.map(nameKey));

  return values.map((current): FieldPlan => {
    const discard = (): FieldPlan => ({
      name: current.name,
      value: current.value,
      fromFieldId: current.fieldId,
      toFieldId: null,
      action: "discarded",
    });
    const path = `customFields.${current.name}`;
    const target = byName.get(nameKey(current.name));
    let problem: string | null = null;
    if (!target) {
      problem = "No custom field with this name in the destination project";
    } else if (target.type !== current.type) {
      problem = `The destination field is ${target.type}, not ${current.type}`;
    } else if (isChoiceType(current.type)) {
      const options = readOptions(target.options);
      const missing = parseChoiceValue(current.value, current.type).filter(
        (option) => !options.includes(option),
      );
      if (missing.length > 0) {
        problem = `The destination field lacks the option(s): ${missing.join(", ")}`;
      }
    }
    if (problem) {
      if (discarded.has(nameKey(current.name))) return discard();
      issues.push({ path, message: problem });
      return discard();
    }
    return {
      name: current.name,
      value: current.value,
      fromFieldId: current.fieldId,
      toFieldId: target?.id ?? null,
      action: "kept",
    };
  });
}

async function applyMove(
  tx: Transaction,
  request: MoveRequest,
): Promise<AppliedMove> {
  const { taskId, destinationProjectId, writer } = request;

  // The task's row lock first: every other write of the task waits for the
  // move, so the plan below cannot go stale before commit.
  const [task] = await tx
    .select()
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1)
    .for("update");
  if (!task) throw new HTTPException(404, { message: "Task not found" });
  if (task.projectId === destinationProjectId) {
    throw new ApiError(400, {
      message: "Task is already in that project",
      code: "TASK_ALREADY_IN_PROJECT",
    });
  }

  const projects = await tx
    .select()
    .from(projectTable)
    .where(inArray(projectTable.id, [task.projectId, destinationProjectId]))
    .orderBy(asc(projectTable.id))
    .for("key share");
  const source = projects.find((p) => p.id === task.projectId);
  const destination = projects.find((p) => p.id === destinationProjectId);
  if (
    !source ||
    !destination ||
    destination.workspaceId !== source.workspaceId
  ) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const issues: ApiErrorIssue[] = [];

  // Column: by slug, never a fallback.
  const [column] = await tx
    .select()
    .from(columnTable)
    .where(
      and(
        eq(columnTable.projectId, destinationProjectId),
        eq(columnTable.slug, task.status),
      ),
    )
    .limit(1);
  if (!column) {
    issues.push({
      path: "column",
      message: `The destination project has no column "${task.status}"`,
    });
  }

  const fields = await planCustomFields(
    tx,
    taskId,
    destinationProjectId,
    request.discardFields,
    issues,
  );

  if (issues.length > 0 || !column) {
    throw new ApiError(409, {
      message:
        "The task cannot be moved: the destination project lacks what it needs. Nothing was changed.",
      code: "TASK_MOVE_UNMAPPABLE",
      issues,
    });
  }

  const fromNumber = task.number;
  const number = await claimTaskNumber(destinationProjectId, tx);
  const position = await nextTaskPosition(
    tx,
    destinationProjectId,
    column.slug,
    column.id,
  );

  const [moved] = await tx
    .update(taskTable)
    .set({
      projectId: destinationProjectId,
      status: column.slug,
      columnId: column.id,
      number,
      position,
    })
    .where(eq(taskTable.id, taskId))
    .returning();
  if (!moved) throw new HTTPException(404, { message: "Task not found" });

  if (fromNumber != null) {
    await tx.insert(taskAliasTable).values({
      taskId,
      projectId: source.id,
      number: fromNumber,
      movedByUserId: writer.userId,
      movedByActor: writer.source === "api_key" ? writer.actor : null,
    });
  }

  // Custom fields: kept values point to the destination's field; the rest
  // (only those the caller agreed to discard) go.
  for (const field of fields) {
    if (field.action === "kept" && field.toFieldId) {
      await tx
        .update(customFieldValueTable)
        .set({ fieldId: field.toFieldId })
        .where(
          and(
            eq(customFieldValueTable.taskId, taskId),
            eq(customFieldValueTable.fieldId, field.fromFieldId),
          ),
        );
    } else {
      await tx
        .delete(customFieldValueTable)
        .where(
          and(
            eq(customFieldValueTable.taskId, taskId),
            eq(customFieldValueTable.fieldId, field.fromFieldId),
          ),
        );
    }
  }

  // Labels belong to the workspace, which a move never leaves: every label of
  // the task already exists in the destination and stays as it is.
  const labels = await tx
    .select({ name: labelTable.name })
    .from(labelTable)
    .where(eq(labelTable.taskId, taskId))
    .orderBy(asc(labelTable.name));

  const initiative = await moveTaskInitiative(
    tx,
    { id: taskId, projectId: destinationProjectId, status: column.slug },
    writer,
  );

  // What upstream's move also does: an assignee without access to the
  // destination is unassigned, links of the source's integrations and the
  // task's assets follow the project.
  let assigneeKept = true;
  if (
    moved.userId &&
    !(
      await filterUsersWithProjectAccess(
        [moved.userId],
        destinationProjectId,
        tx,
      )
    ).has(moved.userId)
  ) {
    assigneeKept = false;
    await tx
      .update(taskTable)
      .set({ userId: null })
      .where(eq(taskTable.id, taskId));
    await createActivities(
      [
        {
          taskId,
          type: "unassigned",
          userId: writer.userId,
          content: null,
          eventData: {},
        },
      ],
      tx,
    );
  }
  await tx
    .delete(externalLinkTable)
    .where(
      and(
        eq(externalLinkTable.taskId, taskId),
        isNotNull(externalLinkTable.integrationId),
        notInArray(
          externalLinkTable.integrationId,
          tx
            .select({ id: integrationTable.id })
            .from(integrationTable)
            .where(eq(integrationTable.projectId, destinationProjectId)),
        ),
      ),
    );
  await tx
    .update(assetTable)
    .set({ projectId: destinationProjectId })
    .where(eq(assetTable.taskId, taskId));

  const result: MoveResult = {
    dryRun: request.dryRun,
    taskId,
    from: {
      projectId: source.id,
      projectSlug: source.slug,
      projectName: source.name,
      number: fromNumber,
      ticketId: fromNumber != null ? `${source.slug}-${fromNumber}` : null,
    },
    to: {
      projectId: destination.id,
      projectSlug: destination.slug,
      projectName: destination.name,
      number,
      ticketId: `${destination.slug}-${number}`,
    },
    column: {
      slug: column.slug,
      name: column.name,
      fromColumnId: task.columnId,
      toColumnId: column.id,
    },
    customFields: fields,
    labels: labels.map((label) => ({ name: label.name, action: "kept" })),
    initiative,
    assignee: { userId: task.userId, kept: assigneeKept },
    // Kept as they are: they hang from the task's id.
    kept: ["comments", "relations", "recurrence", "routine", "automation"],
  };
  return {
    result,
    event: {
      fromProjectName: source.name,
      toProjectName: destination.name,
      oldStatus: task.status,
    },
  };
}

/**
 * POST /api/intelia/task/{taskId}/move (design 11, annex «Mover tareas» §3):
 * the task changes project keeping its id and everything that hangs from it;
 * only its number changes, and the old one stays as an alias. One transaction:
 * anything that cannot be remapped leaves everything unchanged. A dry run does
 * the whole move and rolls it back, so it reports exactly what a move would do.
 */
export async function moveTaskWithAlias(
  request: MoveRequest,
): Promise<MoveResult> {
  await assertProjectAccess(
    request.writer.userId,
    request.destinationProjectId,
  );

  let applied: AppliedMove;
  try {
    applied = await db.transaction(async (tx) => {
      const move = await applyMove(tx, request);
      if (request.dryRun) throw new DryRunRollback(move.result);
      return move;
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return error.result;
    throw error;
  }

  const { result, event } = applied;
  await publishEvent("task.moved", {
    taskId: result.taskId,
    type: "moved",
    userId: request.writer.userId,
    fromProjectId: result.from.projectId,
    fromProjectName: event.fromProjectName,
    toProjectId: result.to.projectId,
    toProjectName: event.toProjectName,
    oldStatus: event.oldStatus,
    newStatus: result.column.slug,
  });
  return result;
}

const aliasProject = alias(projectTable, "task_alias_project");

/** The task's former numbers, oldest move first. */
export async function listTaskAliases(taskId: string) {
  const rows = await db
    .select({
      projectId: taskAliasTable.projectId,
      projectSlug: aliasProject.slug,
      projectName: aliasProject.name,
      number: taskAliasTable.number,
      movedAt: taskAliasTable.movedAt,
    })
    .from(taskAliasTable)
    .innerJoin(aliasProject, eq(taskAliasTable.projectId, aliasProject.id))
    .where(eq(taskAliasTable.taskId, taskId))
    .orderBy(asc(taskAliasTable.movedAt), asc(taskAliasTable.id));
  return {
    aliases: rows.map((row) => ({
      ticketId: `${row.projectSlug}-${row.number}`,
      ...row,
    })),
  };
}

/**
 * Ids of the tasks that had `key-number` before moving, as a subquery for the
 * search. The key compares like upstream's short-id search (no case).
 */
export function aliasedTaskIds(projectKey: string, number: number) {
  return db
    .select({ id: taskAliasTable.taskId })
    .from(taskAliasTable)
    .innerJoin(aliasProject, eq(taskAliasTable.projectId, aliasProject.id))
    .where(
      and(
        eq(taskAliasTable.number, number),
        sql`lower(${aliasProject.slug}) = lower(${projectKey.normalize("NFKC")})`,
      ),
    );
}

/**
 * The lookup by ticket id of a task that no longer has it: the current ticket
 * of each task that had it, looked up again with every access check of
 * upstream's lookup. 404 when none is readable; 409 when several are.
 */
export async function findMovedTicket<T>(
  projectKey: string,
  number: number,
  projectId: string | undefined,
  lookup: (currentTicketId: string) => Promise<T>,
): Promise<T> {
  const current = alias(projectTable, "task_alias_current_project");
  const rows = await db
    .select({ slug: current.slug, number: taskTable.number })
    .from(taskAliasTable)
    .innerJoin(aliasProject, eq(taskAliasTable.projectId, aliasProject.id))
    .innerJoin(taskTable, eq(taskAliasTable.taskId, taskTable.id))
    .innerJoin(current, eq(taskTable.projectId, current.id))
    .where(
      and(
        eq(taskAliasTable.number, number),
        sql`lower(${aliasProject.slug}) = lower(${projectKey.normalize("NFKC")})`,
        projectId ? eq(taskAliasTable.projectId, projectId) : undefined,
      ),
    );

  const found: T[] = [];
  for (const row of rows) {
    try {
      found.push(await lookup(`${row.slug}-${row.number}`));
    } catch (error) {
      if (error instanceof HTTPException && error.status === 404) continue;
      throw error;
    }
  }
  const [match, other] = found;
  if (!match) throw new HTTPException(404, { message: "Task not found" });
  if (other) {
    throw new HTTPException(409, {
      message: "Task ticket ID matches multiple accessible tasks",
    });
  }
  return match;
}
