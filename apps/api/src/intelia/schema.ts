import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  activityTable,
  projectTable,
  taskTable,
  userTable,
  workspaceTable,
} from "../database/schema";
import type { EstadoCompartido } from "./estado-compartido/schema";

// Intelia fork: our tables live in their own PostgreSQL schema, never in
// upstream's. See README-INTELIA.md («Base de datos»).
export const INTELIA_SCHEMA = "intelia";

export const inteliaSchema = pgSchema(INTELIA_SCHEMA);

const utcNow = sql`(now() AT TIME ZONE 'utc')`;

export const taskClassificationTable = inteliaSchema.table(
  "task_classification",
  {
    taskId: text("task_id")
      .primaryKey()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    type: text("type")
      .$type<"implementacion" | "validacion" | "operacion" | "diseno">()
      .notNull(),
    validationInProduction: text("validation_in_production").$type<
      "requerida" | "no_aplica"
    >(),
    validationInProductionReason: text("validation_in_production_reason"),
  },
);

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

// What the task delivers (design 48 §3.2): a pull request or nothing to merge.
export const DELIVERY_KINDS = ["pr", "sin_pr"] as const;
export type DeliveryKind = (typeof DELIVERY_KINDS)[number];

// Unqualified column names: the checks read the row being written.
const levelCheck = (column: string) =>
  sql.raw(`"${column}" in ('manual', 'arranque', 'completa')`);
const sourceCheck = (column: string) =>
  sql.raw(`"${column}" in ('session', 'api_key', 'gateway', 'migration')`);
const deliveryCheck = (column: string) =>
  sql.raw(`"${column}" is null or "${column}" in ('pr', 'sin_pr')`);

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
    // Design 48 §3.2. Yes: the dispatcher moves the columns; no: the
    // responsible does. `level` stays for the old engine until the cut, tied
    // to it by a check: no is `manual`, yes is `arranque` or `completa`.
    automatica: boolean("automatica").notNull(),
    // Why it is paused; only with `automatica` off (pausing is turning it off
    // with a reason).
    pausaMotivo: text("pausa_motivo"),
    entrega: text("entrega").$type<DeliveryKind>(),
    // Graph ids (agent:…, person:…): the project's orchestrator or owner, and
    // the instances that implemented and verified it.
    responsable: text("responsable"),
    implementador: text("implementador"),
    verificador: text("verificador"),
    // Column slug a task in Queued or Blocked came from.
    columnaPrevia: text("columna_previa"),
  },
  () => [
    check("task_automation_level_check", levelCheck("level")),
    check("task_automation_source_check", sourceCheck("source")),
    check(
      "task_automation_completa_verification_check",
      sql.raw(`"level" <> 'completa' or "verification"`),
    ),
    check(
      "task_automation_automatica_level_check",
      sql.raw(`("level" = 'manual') = (not "automatica")`),
    ),
    check(
      "task_automation_pausa_check",
      sql.raw(
        `"pausa_motivo" is null or (not "automatica" and length(btrim("pausa_motivo")) > 0)`,
      ),
    ),
    check("task_automation_entrega_check", deliveryCheck("entrega")),
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
    previousAutomatica: boolean("previous_automatica"),
    automatica: boolean("automatica").notNull(),
    pausaMotivo: text("pausa_motivo"),
    entrega: text("entrega").$type<DeliveryKind>(),
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
    check("task_automation_change_entrega_check", deliveryCheck("entrega")),
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
    objetivo: text("objetivo"),
    hitos_externos: jsonb("hitos_externos").$type<
      {
        nombre: string;
        enlace: string;
        estado: "pendiente" | "hecho" | "bloqueado";
        tarea?: string;
      }[]
    >(),
    estado_compartido: jsonb("estado_compartido").$type<EstadoCompartido>(),
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

// Who asked for a task (design 52 §3.2, IM-04): someone who may follow and
// comment on that one task without access to its project. The access ends
// when the task reaches a cancelled column (`closedAt`); `closedReason` is the
// rejection's reason, sent to the requester in the notice. `pendingReason`
// carries a rejection's reason from the reject route to the close, which runs
// on the status change, whichever path made it.
export const taskRequestTable = inteliaSchema.table(
  "task_request",
  {
    taskId: text("task_id")
      .primaryKey()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    requesterUserId: text("requester_user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    setByUserId: text("set_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    setByActor: text("set_by_actor"),
    requestedAt: timestamp("requested_at", { mode: "date" })
      .default(utcNow)
      .notNull(),
    pendingReason: text("pending_reason"),
    closedAt: timestamp("closed_at", { mode: "date" }),
    closedReason: text("closed_reason"),
  },
  (table) => [
    index("task_request_requester_idx").on(
      table.requesterUserId,
      table.requestedAt,
    ),
  ],
);

// Priorities of a workspace (README-INTELIA.md, «Prioridades»; design 53
// §3.5): a tree of short texts, ordered among siblings, linked with zero or
// more projects. Kaneo knows nothing of what they mean.
export const PRIORITY_STATUSES = ["active", "closed"] as const;
export type PriorityStatus = (typeof PRIORITY_STATUSES)[number];
export const PRIORITY_CHANGE_KINDS = ["created", "updated"] as const;
export type PriorityChangeKind = (typeof PRIORITY_CHANGE_KINDS)[number];
export const PRIORITY_CHANGE_SOURCES = ["session", "api_key"] as const;
export type PriorityChangeSource = (typeof PRIORITY_CHANGE_SOURCES)[number];

export const priorityTable = inteliaSchema.table(
  "priority",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Null for a root. Cascade only so a workspace's deletion can remove the
    // whole tree: the API never deletes a priority, it closes it.
    parentId: text("parent_id").references(
      (): AnyPgColumn => priorityTable.id,
      { onDelete: "cascade", onUpdate: "cascade" },
    ),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    // 0..n-1 among the priorities with the same parent.
    position: integer("position").notNull(),
    status: text("status").$type<PriorityStatus>().notNull().default("active"),
    createdByUserId: text("created_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" })
      .default(utcNow)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .default(utcNow)
      .notNull(),
  },
  (table) => [
    index("priority_workspace_parent_idx").on(
      table.workspaceId,
      table.parentId,
      table.position,
    ),
    check("priority_status_check", inCheck("status", PRIORITY_STATUSES)),
  ],
);

export const priorityProjectTable = inteliaSchema.table(
  "priority_project",
  {
    priorityId: text("priority_id")
      .notNull()
      .references(() => priorityTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({ columns: [table.priorityId, table.projectId] }),
    index("priority_project_project_id_idx").on(table.projectId),
  ],
);

// Change log of a priority: its creation and every edit, with the changed
// fields before (null on creation) and after.
export const priorityChangeTable = inteliaSchema.table(
  "priority_change",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    priorityId: text("priority_id")
      .notNull()
      .references(() => priorityTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    kind: text("kind").$type<PriorityChangeKind>().notNull(),
    previous: jsonb("previous").$type<Record<string, unknown>>(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull(),
    changedByUserId: text("changed_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    source: text("source").$type<PriorityChangeSource>().notNull(),
    changedAt: timestamp("changed_at", { mode: "date" })
      .default(utcNow)
      .notNull(),
  },
  (table) => [
    index("priority_change_priority_id_idx").on(
      table.priorityId,
      table.changedAt,
    ),
    check("priority_change_kind_check", inCheck("kind", PRIORITY_CHANGE_KINDS)),
    check(
      "priority_change_source_check",
      inCheck("source", PRIORITY_CHANGE_SOURCES),
    ),
  ],
);

// Where a workspace's administrators send `intelia.priority_changed`: only
// destinations registered for it, never the projects' webhooks, so no
// existing integration receives priorities it was not set up for.
export const priorityWebhookTable = inteliaSchema.table(
  "priority_webhook",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    url: text("url").notNull(),
    // Signs each body (X-Kaneo-Signature); never returned by the API.
    secret: text("secret"),
    createdByUserId: text("created_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" })
      .default(utcNow)
      .notNull(),
  },
  (table) => [
    uniqueIndex("priority_webhook_workspace_url_idx").on(
      table.workspaceId,
      table.url,
    ),
  ],
);

// Archived tasks (design 53 §3.2, KF-4): a mark apart from the status. The task
// stays in its done or cancelled column, so dependencies, initiatives and the
// critical path keep reading `task.status`; only the board and the listings
// leave it out unless asked.
export const taskArchiveTable = inteliaSchema.table("task_archive", {
  taskId: text("task_id")
    .primaryKey()
    .references(() => taskTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  archivedAt: timestamp("archived_at", { mode: "date" })
    .default(utcNow)
    .notNull(),
  archivedByUserId: text("archived_by_user_id").references(() => userTable.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
});

// The report of migration 0016: tasks left in upstream's virtual `archived`
// status because their history does not say which closed column they came
// from. To be reviewed by hand.
export const taskArchiveMigrationSkipTable = inteliaSchema.table(
  "task_archive_migration_skip",
  {
    taskId: text("task_id")
      .primaryKey()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    reason: text("reason")
      .$type<"no_history" | "not_a_closed_column">()
      .notNull(),
    oldStatus: text("old_status"),
    recordedAt: timestamp("recorded_at", { mode: "date" })
      .default(utcNow)
      .notNull(),
  },
);

// One row written by migration 0016: how many tasks went back to each closed
// status (`{ "done": n, "cancelled": m }`) and how many were skipped.
export const taskArchiveMigrationReportTable = inteliaSchema.table(
  "task_archive_migration_report",
  {
    ranAt: timestamp("ran_at", { mode: "date" }).default(utcNow).notNull(),
    restored: jsonb("restored").$type<Record<string, number>>().notNull(),
    skipped: integer("skipped").notNull(),
  },
);
