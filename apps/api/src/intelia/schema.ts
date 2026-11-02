import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { activityTable, taskTable, userTable } from "../database/schema";

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
