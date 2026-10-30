import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
  boolean,
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
