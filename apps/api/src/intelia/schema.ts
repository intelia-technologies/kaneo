import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
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
