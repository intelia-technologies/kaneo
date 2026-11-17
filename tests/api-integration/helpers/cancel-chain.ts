// Seeds the chain of a CD-01 sample (design 82) in the test database: the
// projects by key, the root and every visible node with its number, title,
// column, assignee, automation, routine and open pull request, and each
// `blocks` relation with the id the sample shows.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import db, { schema } from "../../../apps/api/src/database";
import {
  routineTable,
  taskAutomationTable,
} from "../../../apps/api/src/intelia/schema";
import { createProjectFixture } from "./fixtures";
import { addWorkspaceMember } from "./project-access/add-workspace-member";

export type SampleNode = {
  tipo: string;
  ticket?: string;
  titulo?: string;
  estado?: string;
  depende_de?: { ticket: string; relacion: string }[];
  responsable?: string | null;
  asignado?: string | null;
  automatica?: boolean;
  rutina_activa?: boolean;
  en_curso?: boolean;
};

export type ChainSample = {
  valor: {
    details: {
      tarea: { ticket: string; titulo: string; tablero: string };
      cadena: SampleNode[];
    };
  };
};

export type Seeded = {
  workspaceId: string;
  projects: Map<string, string>;
  ids: Map<string, string>;
  task: (ticket: string) => Promise<typeof schema.taskTable.$inferSelect>;
  add: (ticket: string, overrides?: Partial<SampleNode>) => Promise<string>;
  relate: (source: string, target: string, id?: string) => Promise<string>;
};

export async function seedWorkspace(
  workspaceId: string,
  ownerId: string,
): Promise<Seeded> {
  const projects = new Map<string, string>();
  const ids = new Map<string, string>();
  const users = new Map<string, string>();

  const project = async (slug: string) => {
    if (!projects.has(slug)) {
      const { project } = await createProjectFixture({
        workspaceId,
        name: slug,
        slug,
      });
      projects.set(slug, project.id);
    }
    return projects.get(slug)!;
  };
  const user = async (name: string) => {
    if (!users.has(name)) {
      const created = await addWorkspaceMember(workspaceId);
      await db
        .update(schema.userTable)
        .set({ name })
        .where(eq(schema.userTable.id, created.id));
      users.set(name, created.id);
    }
    return users.get(name)!;
  };

  const add = async (ticket: string, node: Partial<SampleNode> = {}) => {
    const [slug, number] = ticket.split("-");
    const projectId = await project(slug!);
    const status = node.estado ?? "to-do";
    const [column] = await db
      .select({ id: schema.columnTable.id })
      .from(schema.columnTable)
      .where(
        and(
          eq(schema.columnTable.projectId, projectId),
          eq(schema.columnTable.slug, status),
        ),
      );
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId,
        number: Number(number),
        title: node.titulo ?? ticket,
        status,
        columnId: column?.id ?? null,
        userId: node.asignado ? await user(node.asignado) : null,
      })
      .returning();
    ids.set(ticket, task!.id);
    if (node.automatica !== undefined || node.responsable) {
      const automatica = node.automatica ?? false;
      await db.insert(taskAutomationTable).values({
        taskId: task!.id,
        level: automatica ? "arranque" : "manual",
        verification: false,
        automatica,
        responsable: node.responsable ?? null,
        source: "migration",
      });
    }
    if (node.rutina_activa)
      await db.insert(routineTable).values({
        taskId: task!.id,
        cron: "0 9 * * 1",
        ownerId,
        nextRunAt: new Date(Date.now() + 86_400_000),
      });
    if (node.en_curso)
      await db.insert(schema.externalLinkTable).values({
        taskId: task!.id,
        resourceType: "pull_request",
        externalId: randomUUID(),
        url: `https://github.com/example/repo/pull/${number}`,
        metadata: JSON.stringify({ state: "open" }),
      });
    return task!.id;
  };

  const relate = async (source: string, target: string, id?: string) => {
    const [relation] = await db
      .insert(schema.taskRelationTable)
      .values({
        ...(id ? { id } : {}),
        sourceTaskId: ids.get(source)!,
        targetTaskId: ids.get(target)!,
        relationType: "blocks",
      })
      .returning();
    return relation!.id;
  };

  const task = async (ticket: string) => {
    const [row] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, ids.get(ticket)!));
    return row!;
  };

  return { workspaceId, projects, ids, task, add, relate };
}

/** The sample's root, nodes and relations; `extra` overrides fields by key. */
export async function seedSample(
  seeded: Seeded,
  sample: ChainSample,
  extra: Record<string, Partial<SampleNode>> = {},
) {
  const { tarea, cadena } = sample.valor.details;
  await seeded.add(tarea.ticket, {
    titulo: tarea.titulo,
    ...extra[tarea.ticket],
  });
  for (const n of cadena)
    await seeded.add(n.ticket!, { ...n, ...extra[n.ticket!] });
  for (const n of cadena)
    for (const d of n.depende_de ?? [])
      await seeded.relate(d.ticket, n.ticket!, d.relacion);
}
