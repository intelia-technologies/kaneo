import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  activityTable,
  projectTable,
  taskTable,
  userTable,
} from "../database/schema";

// Intelia fork: our tables live in their own PostgreSQL schema, never in
// upstream's. See README-INTELIA.md («Base de datos»).
export const INTELIA_SCHEMA = "intelia";

export const inteliaSchema = pgSchema(INTELIA_SCHEMA);

const utcNow = sql`(now() AT TIME ZONE 'utc')`;

export const commentReactionTable = inteliaSchema.table(
  "comment_reaction",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    commentId: text("comment_id").references(() => activityTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    emoji: text("emoji").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    externalUserName: text("external_user_name"),
    createdAt: timestamp("created_at", { mode: "date" })
      .default(utcNow)
      .notNull(),
  },
  (table) => [
    uniqueIndex("comment_reaction_unique_idx").on(
      table.taskId,
      sql`coalesce(${table.commentId}, '')`,
      table.emoji,
      table.userId,
      sql`coalesce(${table.externalUserName}, '')`,
    ),
    index("comment_reaction_comment_id_idx").on(table.commentId),
  ],
);

// Scheduled routines (README-INTELIA.md, «Rutinas programadas»): a task that
// the scheduler reopens to In progress on a cron schedule.
export const ROUTINE_RESULTS = [
  "reabierta",
  "saltada_abierta",
  "error",
] as const;
export type RoutineResult = (typeof ROUTINE_RESULTS)[number];

export const routineTable = inteliaSchema.table(
  "routine",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    cron: text("cron").notNull(),
    timezone: text("timezone").default("Europe/Madrid").notNull(),
    active: boolean("active").default(true).notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    nextRunAt: timestamp("next_run_at", { mode: "date" }).notNull(),
    lastRunAt: timestamp("last_run_at", { mode: "date" }),
    lastResult: text("last_result").$type<RoutineResult>(),
    createdAt: timestamp("created_at", { mode: "date" })
      .default(utcNow)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .default(utcNow)
      .notNull(),
  },
  (table) => [
    uniqueIndex("routine_task_id_idx").on(table.taskId),
    index("routine_due_idx").on(table.active, table.nextRunAt),
  ],
);

export const routineRunTable = inteliaSchema.table(
  "routine_run",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    routineId: text("routine_id")
      .notNull()
      .references(() => routineTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    scheduledAt: timestamp("scheduled_at", { mode: "date" }).notNull(),
    result: text("result").$type<RoutineResult>().notNull(),
    error: text("error"),
    // When the task reached a final column (Done, Cancelled) after this run.
    closedAt: timestamp("closed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" })
      .default(utcNow)
      .notNull(),
  },
  (table) => [
    index("routine_run_routine_id_idx").on(table.routineId, table.scheduledAt),
  ],
);

// Automation level of each task (README-INTELIA.md, «Nivel de
// automatización»): who starts it and who merges it (design 18 §3).
export const AUTOMATION_LEVELS = ["manual", "arranque", "completa"] as const;
export type AutomationLevel = (typeof AUTOMATION_LEVELS)[number];

// How the level was written: a person's session, an account's API key, or the
// one-off backfill migration. Nothing writes `gateway` any more (the gateway
// now calls with its account's API key); it stays so the table keeps its check.
export const AUTOMATION_SOURCES = [
  "session",
  "api_key",
  "gateway",
  "migration",
] as const;
export type AutomationSource = (typeof AUTOMATION_SOURCES)[number];

// Unqualified column names: the checks read the row being written.
const levelCheck = (column: string) =>
  sql.raw(`"${column}" in ('manual', 'arranque', 'completa')`);
const sourceCheck = (column: string) =>
  sql.raw(`"${column}" in ('session', 'api_key', 'gateway', 'migration')`);

export const taskAutomationTable = inteliaSchema.table(
  "task_automation",
  {
    taskId: text("task_id")
      .primaryKey()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    level: text("level").$type<AutomationLevel>().notNull(),
    verification: boolean("verification").notNull(),
    // A Kaneo user (session or API key); null for the gateway and the backfill.
    setByUserId: text("set_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // The graph actor the gateway acted for (agent:…, person:…).
    setByActor: text("set_by_actor"),
    source: text("source").$type<AutomationSource>().notNull(),
    setAt: timestamp("set_at", { mode: "date" }).default(utcNow).notNull(),
  },
  () => [
    check("task_automation_level_check", levelCheck("level")),
    check("task_automation_source_check", sourceCheck("source")),
    check(
      "task_automation_completa_verification_check",
      sql.raw(`"level" <> 'completa' or "verification"`),
    ),
  ],
);

// Change log: one row per creation, change or backfill of a task's level.
export const taskAutomationChangeTable = inteliaSchema.table(
  "task_automation_change",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // null when the change set the first level.
    previousLevel: text("previous_level").$type<AutomationLevel>(),
    previousVerification: boolean("previous_verification"),
    level: text("level").$type<AutomationLevel>().notNull(),
    verification: boolean("verification").notNull(),
    changedByUserId: text("changed_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    changedByActor: text("changed_by_actor"),
    source: text("source").$type<AutomationSource>().notNull(),
    changedAt: timestamp("changed_at", { mode: "date" })
      .default(utcNow)
      .notNull(),
  },
  (table) => [
    index("task_automation_change_task_id_idx").on(
      table.taskId,
      table.changedAt,
    ),
    check("task_automation_change_level_check", levelCheck("level")),
    check("task_automation_change_source_check", sourceCheck("source")),
  ],
);

// Initiatives (README-INTELIA.md, «Iniciativas»; design 19 §3 and §4): a
// group of tasks of one project, with a plan that closes once.
export const TASK_ORIGINS = ["plan", "añadido", "sin_registro"] as const;
export type TaskOrigin = (typeof TASK_ORIGINS)[number];

// Who wrote an initiative or a task's membership: a person's session, an
// account's API key, the rule that closes a plan on its own (`auto`), a task
// leaving its project (`project_move`) or a migration.
export const INITIATIVE_SOURCES = ["session", "api_key", "migration"] as const;
export type InitiativeSource = (typeof INITIATIVE_SOURCES)[number];
export const INITIATIVE_CHANGE_SOURCES = [
  "session",
  "api_key",
  "auto",
  "migration",
] as const;
export type InitiativeChangeSource = (typeof INITIATIVE_CHANGE_SOURCES)[number];
export const INITIATIVE_CHANGE_KINDS = [
  "created",
  "updated",
  "plan_closed",
] as const;
export type InitiativeChangeKind = (typeof INITIATIVE_CHANGE_KINDS)[number];
export const TASK_INITIATIVE_CHANGE_SOURCES = [
  "session",
  "api_key",
  "project_move",
  "migration",
] as const;
export type TaskInitiativeChangeSource =
  (typeof TASK_INITIATIVE_CHANGE_SOURCES)[number];

const inCheck = (column: string, values: readonly string[]) =>
  sql.raw(`"${column}" in (${values.map((v) => `'${v}'`).join(", ")})`);

export const initiativeTable = inteliaSchema.table(
  "initiative",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    // The name without case, accents or repeated spaces: unique per project.
    nameKey: text("name_key").notNull(),
    designUrl: text("design_url"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    createdByUserId: text("created_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdByActor: text("created_by_actor"),
    source: text("source").$type<InitiativeSource>().notNull(),
    createdAt: timestamp("created_at", { mode: "date" })
      .default(utcNow)
      .notNull(),
    // Null while the plan is being made; set once, by hand or by the first
    // task of the initiative that reaches In progress.
    planClosedAt: timestamp("plan_closed_at", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("initiative_project_name_key_idx").on(
      table.projectId,
      table.nameKey,
    ),
    check("initiative_source_check", inCheck("source", INITIATIVE_SOURCES)),
  ],
);

// Change log of an initiative: creation, edits of its data, plan closing.
export const initiativeChangeTable = inteliaSchema.table(
  "initiative_change",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    initiativeId: text("initiative_id")
      .notNull()
      .references(() => initiativeTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    kind: text("kind").$type<InitiativeChangeKind>().notNull(),
    // The changed fields before (null on creation) and after.
    previous: jsonb("previous").$type<Record<string, unknown>>(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull(),
    // The task whose start closed the plan (`auto`); null otherwise.
    taskId: text("task_id").references(() => taskTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    changedByUserId: text("changed_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    changedByActor: text("changed_by_actor"),
    source: text("source").$type<InitiativeChangeSource>().notNull(),
    changedAt: timestamp("changed_at", { mode: "date" })
      .default(utcNow)
      .notNull(),
  },
  (table) => [
    index("initiative_change_initiative_id_idx").on(
      table.initiativeId,
      table.changedAt,
    ),
    check(
      "initiative_change_kind_check",
      inCheck("kind", INITIATIVE_CHANGE_KINDS),
    ),
    check(
      "initiative_change_source_check",
      inCheck("source", INITIATIVE_CHANGE_SOURCES),
    ),
  ],
);

// The initiative of each task, with its origin against the plan.
export const taskInitiativeTable = inteliaSchema.table(
  "task_initiative",
  {
    taskId: text("task_id")
      .primaryKey()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    initiativeId: text("initiative_id")
      .notNull()
      .references(() => initiativeTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    origin: text("origin").$type<TaskOrigin>().notNull(),
    since: timestamp("since", { mode: "date" }).default(utcNow).notNull(),
    setByUserId: text("set_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    setByActor: text("set_by_actor"),
    source: text("source").$type<InitiativeSource>().notNull(),
  },
  (table) => [
    index("task_initiative_initiative_id_idx").on(table.initiativeId),
    check("task_initiative_origin_check", inCheck("origin", TASK_ORIGINS)),
    check(
      "task_initiative_source_check",
      inCheck("source", INITIATIVE_SOURCES),
    ),
  ],
);

// Change log of a task's initiative: first assignment, moves and removal.
export const taskInitiativeChangeTable = inteliaSchema.table(
  "task_initiative_change",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    previousInitiativeId: text("previous_initiative_id").references(
      () => initiativeTable.id,
      { onDelete: "set null", onUpdate: "cascade" },
    ),
    previousOrigin: text("previous_origin").$type<TaskOrigin>(),
    // Null when the task lost its initiative (it left the project).
    initiativeId: text("initiative_id").references(() => initiativeTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    origin: text("origin").$type<TaskOrigin>(),
    changedByUserId: text("changed_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    changedByActor: text("changed_by_actor"),
    source: text("source").$type<TaskInitiativeChangeSource>().notNull(),
    changedAt: timestamp("changed_at", { mode: "date" })
      .default(utcNow)
      .notNull(),
  },
  (table) => [
    index("task_initiative_change_task_id_idx").on(
      table.taskId,
      table.changedAt,
    ),
    check(
      "task_initiative_change_source_check",
      inCheck("source", TASK_INITIATIVE_CHANGE_SOURCES),
    ),
  ],
);

// The numbers a task had before moving to another project (design 11, annex
// «Mover tareas» §2): `SF-745` still finds the task after it becomes
// `INFRA-12`. Numbers are never reused within a project, so an old number
// names one task.
export const taskAliasTable = inteliaSchema.table(
  "task_alias",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // The project the task left and its number there.
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    number: integer("number").notNull(),
    movedByUserId: text("moved_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    movedByActor: text("moved_by_actor"),
    movedAt: timestamp("moved_at", { mode: "date" }).default(utcNow).notNull(),
  },
  (table) => [
    uniqueIndex("task_alias_project_number_idx").on(
      table.projectId,
      table.number,
    ),
    index("task_alias_task_id_idx").on(table.taskId, table.movedAt),
  ],
);

// Board signals (README-INTELIA.md, «Señales del tablero»): what the
// factory's dispatcher knows about a project's open tasks and the card shows
// (design 32 §4, RT-05): the mean stay of each column, alarms, waits and
// workers. One row per project, replaced on every write; Kaneo never computes
// it and never calls the factory (design 11).
export const boardSignalTable = inteliaSchema.table("board_signal", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projectTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  signals: jsonb("signals")
    .$type<{
      columnas: Record<string, unknown>;
      tareas: Record<string, unknown>;
    }>()
    .notNull(),
  calculatedAt: timestamp("calculated_at", { mode: "date" }).notNull(),
  updatedByUserId: text("updated_by_user_id").references(() => userTable.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .default(utcNow)
    .notNull(),
});
