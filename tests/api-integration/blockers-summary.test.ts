import { eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { boardSignalTable } from "../../apps/api/src/intelia/schema";
import getTask from "../../apps/api/src/task/controllers/get-task";
import getTasks from "../../apps/api/src/task/controllers/get-tasks";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

describe("board blocker summaries", () => {
  beforeEach(resetTestDatabase);

  it("counts incoming unfinished blockers and waits for the deployed release", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const [validation, blocker] = await db
      .insert(schema.taskTable)
      .values([
        {
          projectId: project.id,
          title: "Validation",
          status: "to-do",
          number: 1,
        },
        {
          projectId: project.id,
          title: "Implementation",
          status: "cancelled",
          number: 2,
        },
      ])
      .returning();
    await db.execute(
      sql`insert into intelia.task_classification (task_id, type) values (${validation.id}, 'validacion')`,
    );
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: blocker.id,
      targetTaskId: validation.id,
      relationType: "blocks",
    });
    const summary = async () => {
      const { data } = await getTasks(project.id, {}, member.user.id);
      return data.columns
        .flatMap((column) => column.tasks)
        .find((task) => task.id === validation.id)?.blockersSummary;
    };
    expect(await summary()).toMatchObject({
      pendingCount: 1,
      hasCancelledBlocker: true,
      waitingRelease: false,
      externalCount: 0,
    });
    await db
      .update(schema.taskTable)
      .set({ status: "done" })
      .where(eq(schema.taskTable.id, blocker.id));
    expect(await summary()).toMatchObject({
      pendingCount: 0,
      hasCancelledBlocker: false,
      waitingRelease: true,
      blockers: [],
    });
    const [field] = await db
      .insert(schema.customFieldDefinitionTable)
      .values({ projectId: project.id, name: "release", type: "text" })
      .returning();
    await db.insert(schema.customFieldValueTable).values({
      taskId: validation.id,
      fieldId: field.id,
      value: "desplegada",
    });
    expect(await summary()).toMatchObject({ waitingRelease: false });
  });

  it("does not reveal a private blocker on a public board", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const other = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const [target] = await db
      .insert(schema.taskTable)
      .values({ projectId: project.id, title: "Target", status: "to-do" })
      .returning();
    const [secret] = await db
      .insert(schema.taskTable)
      .values({
        projectId: other.project.id,
        title: "Secret",
        status: "cancelled",
      })
      .returning();
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: secret.id,
      targetTaskId: target.id,
      relationType: "blocks",
    });
    const [paused] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        title: "Paused",
        status: "to-do",
        number: 2,
      })
      .returning();
    await db.execute(sql`insert into intelia.task_automation
      (task_id, level, verification, source, automatica, pausa_motivo)
      values (${paused.id}, 'manual', true, 'migration', false, 'internal note')`);
    const { data } = await getTasks(project.id, { publicOnly: true });
    const tasks = data.columns.flatMap((column) => column.tasks);
    const summary = tasks.find(
      (task) => task.id === target.id,
    )?.blockersSummary;
    // Automation settings are internal: a public board does not show them.
    expect(
      tasks.find((task) => task.id === paused.id)?.blockersSummary,
    ).toMatchObject({
      reason: "ready",
      notStartingReason: null,
      pauseReason: null,
    });
    expect(summary).toEqual({
      pendingCount: 1,
      hasCancelledBlocker: false,
      waitingRelease: false,
      blockers: [],
      externalCount: 1,
      byState: {
        in_progress: 0,
        not_started: 0,
        blocked: 0,
        person: 0,
        cancelled: 0,
      },
      reason: "external",
      notStartingReason: null,
      pauseReason: null,
      root: { kind: "external", task: null, depth: 1 },
    });
    expect(JSON.stringify(summary)).not.toContain(secret.id);
  });
});

// Design 55 §3.1: why a To do task waits.
describe("why a task waits", () => {
  beforeEach(resetTestDatabase);

  type Task = typeof schema.taskTable.$inferSelect;
  let number = 0;
  const addTask = async (
    projectId: string,
    values: Partial<typeof schema.taskTable.$inferInsert> = {},
  ) => {
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId,
        title: `Task ${++number}`,
        status: "to-do",
        number,
        ...values,
      })
      .returning();
    return task;
  };
  const blocks = (source: Task, target: Task) =>
    db.insert(schema.taskRelationTable).values({
      sourceTaskId: source.id,
      targetTaskId: target.id,
      relationType: "blocks",
    });
  const addUser = async (email: string, name: string) => {
    const [user] = await db
      .insert(schema.userTable)
      .values({ id: email, email, name, emailVerified: true })
      .returning();
    return user;
  };
  const setAutomation = (
    task: Task,
    automatica: boolean,
    pausaMotivo: string | null = null,
  ) =>
    db.execute(sql`insert into intelia.task_automation
      (task_id, level, verification, source, automatica, pausa_motivo)
      values (${task.id}, ${automatica ? "arranque" : "manual"}, true, 'migration', ${automatica}, ${pausaMotivo})`);
  const boardSummaries = async (projectId: string, userId: string) => {
    const { data } = await getTasks(projectId, {}, userId);
    return new Map(
      data.columns
        .flatMap((column) => column.tasks)
        .map((task) => [task.id, task.blockersSummary]),
    );
  };

  async function seed() {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const role = await addUser("role-coder@inteliatech.internal", "coder");
    const person = await addUser("jaime@inteliatech.ai", "Jaime");
    return { member, project, role, person };
  }

  it("counts each pending blocker by state, with the person it waits for", async () => {
    const { member, project, role, person } = await seed();
    const target = await addTask(project.id);
    const working = await addTask(project.id, {
      status: "ready-to-merge",
      userId: role.id,
    });
    const queued = await addTask(project.id, {
      status: "queued",
      userId: role.id,
    });
    const blockedNoSignal = await addTask(project.id, { status: "blocked" });
    const blockedOnTask = await addTask(project.id, { status: "blocked" });
    const blockedOnPerson = await addTask(project.id, { status: "blocked" });
    const assignedPerson = await addTask(project.id, {
      status: "in-progress",
      userId: person.id,
    });
    const decision = await addTask(project.id, { userId: role.id });
    const cancelled = await addTask(project.id, { status: "cancelled" });
    const finished = await addTask(project.id, { status: "done" });
    for (const blocker of [
      working,
      queued,
      blockedNoSignal,
      blockedOnTask,
      blockedOnPerson,
      assignedPerson,
      decision,
      cancelled,
      finished,
    ])
      await blocks(blocker, target);
    await db.insert(schema.labelTable).values({
      name: "decision",
      color: "#f00",
      taskId: decision.id,
      workspaceId: member.workspace.id,
    });
    await db.insert(boardSignalTable).values({
      projectId: project.id,
      calculatedAt: new Date(),
      signals: {
        columnas: {},
        tareas: {
          [blockedOnTask.id]: { alarma: null, espera_a: "SF-9", worker: null },
          [blockedOnPerson.id]: {
            alarma: null,
            espera_a: "person:pablo",
            worker: null,
          },
        },
      },
    });

    const summary = (await boardSummaries(project.id, member.user.id)).get(
      target.id,
    )!;
    expect(summary).toMatchObject({
      pendingCount: 8,
      hasCancelledBlocker: true,
      externalCount: 0,
      byState: {
        in_progress: 1,
        not_started: 1,
        blocked: 2,
        person: 3,
        cancelled: 1,
      },
      reason: "cancelled",
      notStartingReason: null,
    });
    const byId = new Map(summary.blockers.map((item) => [item.id, item]));
    expect(byId.has(finished.id)).toBe(false);
    expect(byId.get(working.id)).toMatchObject({
      state: "in_progress",
      title: working.title,
      person: null,
    });
    expect(byId.get(queued.id)?.state).toBe("not_started");
    expect(byId.get(blockedNoSignal.id)?.state).toBe("blocked");
    expect(byId.get(blockedOnTask.id)?.state).toBe("blocked");
    expect(byId.get(blockedOnPerson.id)).toMatchObject({
      state: "person",
      person: "person:pablo",
    });
    expect(byId.get(assignedPerson.id)).toMatchObject({
      state: "person",
      person: "Jaime",
    });
    expect(byId.get(decision.id)).toMatchObject({
      state: "person",
      person: null,
    });
    expect(byId.get(cancelled.id)?.state).toBe("cancelled");

    // Without cancelled ones, a person is the worst; in progress only is blue.
    await db
      .delete(schema.taskRelationTable)
      .where(eq(schema.taskRelationTable.sourceTaskId, cancelled.id));
    expect(
      (await boardSummaries(project.id, member.user.id)).get(target.id)?.reason,
    ).toBe("person");
  });

  it("says why a ready To do task will not start alone", async () => {
    const { member, project, role, person } = await seed();
    const ready = await addTask(project.id, { userId: role.id });
    await setAutomation(ready, true);
    const manual = await addTask(project.id, { userId: role.id });
    await setAutomation(manual, false);
    const paused = await addTask(project.id, { userId: role.id });
    await setAutomation(paused, false, "movida_a_mano");
    const never = await addTask(project.id, { userId: role.id });
    const unassigned = await addTask(project.id);
    await setAutomation(unassigned, true);
    const personal = await addTask(project.id, { userId: person.id });
    await setAutomation(personal, true);
    const validation = await addTask(project.id, { userId: role.id });
    await setAutomation(validation, true);
    await db.execute(
      sql`insert into intelia.task_classification (task_id, type) values (${validation.id}, 'validacion')`,
    );
    const inProgress = await addTask(project.id, {
      status: "in-progress",
    });

    const summaries = await boardSummaries(project.id, member.user.id);
    const reasonOf = (task: Task) => summaries.get(task.id)?.notStartingReason;
    expect(summaries.get(ready.id)).toMatchObject({
      reason: "ready",
      notStartingReason: null,
      pauseReason: null,
      root: null,
    });
    expect(reasonOf(manual)).toBe("automation_off");
    expect(summaries.get(paused.id)).toMatchObject({
      notStartingReason: "paused",
      pauseReason: "movida_a_mano",
    });
    expect(reasonOf(never)).toBe("automation_off");
    expect(reasonOf(unassigned)).toBe("no_role");
    expect(reasonOf(personal)).toBe("no_role");
    expect(summaries.get(validation.id)).toMatchObject({
      waitingRelease: true,
      notStartingReason: "waiting_release",
    });
    // Only To do says it.
    expect(reasonOf(inProgress)).toBeNull();
  });

  it("finds the root of a chain of 5 on the board and in the task detail", async () => {
    const { member, project } = await seed();
    const target = await addTask(project.id);
    const chain: Task[] = [];
    let next = target;
    for (let i = 0; i < 5; i++) {
      const blocker = await addTask(project.id, {
        status: i === 4 ? "in-progress" : "to-do",
      });
      await blocks(blocker, next);
      chain.push(blocker);
      next = blocker;
    }
    const root = chain[4]!;
    const expected = {
      kind: "task",
      task: { id: root.id, title: root.title, state: "in_progress" },
      depth: 5,
    };
    expect(
      (await boardSummaries(project.id, member.user.id)).get(target.id)?.root,
    ).toMatchObject(expected);
    const detail = await getTask(target.id, false, member.user.id);
    expect(detail.blockersSummary).toMatchObject({
      pendingCount: 1,
      root: expected,
    });
    // Outside To do the root is not computed; the card stays as today.
    await db
      .update(schema.taskTable)
      .set({ status: "in-review" })
      .where(eq(schema.taskTable.id, target.id));
    expect(
      (await getTask(target.id, true, member.user.id)).blockersSummary,
    ).toMatchObject({ pendingCount: 1, root: null });
  });

  it("reports a cycle", async () => {
    const { member, project } = await seed();
    const target = await addTask(project.id);
    const a = await addTask(project.id);
    const b = await addTask(project.id);
    await blocks(a, target);
    await blocks(b, a);
    await blocks(a, b);
    expect(
      (await boardSummaries(project.id, member.user.id)).get(target.id)?.root,
    ).toEqual({ kind: "cycle", task: null, depth: null });
  });

  it("does not show the title of a blocker in a project without access", async () => {
    const { member, project } = await seed();
    const { project: hidden } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    await db.insert(schema.workspaceMemberAccessTable).values({
      workspaceId: member.workspace.id,
      userId: member.user.id,
      projectAccess: "selected",
    });
    await db.insert(schema.workspaceMemberProjectTable).values({
      workspaceId: member.workspace.id,
      userId: member.user.id,
      projectId: project.id,
    });
    const target = await addTask(project.id);
    const secret = await addTask(hidden.id, {
      title: "Secret roadmap",
      status: "blocked",
    });
    const behind = await addTask(project.id, { title: "Behind the secret" });
    await blocks(secret, target);
    await blocks(behind, secret);

    const summary = (await boardSummaries(project.id, member.user.id)).get(
      target.id,
    );
    expect(summary).toMatchObject({
      pendingCount: 1,
      externalCount: 1,
      blockers: [],
      reason: "external",
      root: { kind: "external", task: null, depth: 1 },
    });
    const text = JSON.stringify(summary);
    expect(text).not.toContain("Secret roadmap");
    expect(text).not.toContain(secret.id);
    expect(text).not.toContain("Behind the secret");
  });

  it("serves a page of 50 To do tasks with chains of 5 within 200 ms of the direct blockers alone", async () => {
    const { member, project } = await seed();
    const targets: Task[] = [];
    for (let t = 0; t < 50; t++) {
      const target = await addTask(project.id, { position: t });
      targets.push(target);
      let next = target;
      for (let i = 0; i < 5; i++) {
        const blocker = await addTask(project.id, { status: "backlog" });
        await blocks(blocker, next);
        next = blocker;
      }
    }
    const page = { status: "to-do", limit: 50 };
    const median = async (options: typeof page) => {
      const times: number[] = [];
      for (let i = 0; i < 7; i++) {
        const started = performance.now();
        await getTasks(project.id, options, member.user.id);
        times.push(performance.now() - started);
      }
      return times.sort((a, b) => a - b)[3]!;
    };
    const { data } = await getTasks(project.id, page, member.user.id);
    const roots = data.columns
      .flatMap((column) => column.tasks)
      .map((task) => task.blockersSummary.root?.depth);
    expect(roots).toHaveLength(50);
    expect(new Set(roots)).toEqual(new Set([5]));
    const withChains = await median(page);
    // The same page outside To do reads only the direct blockers, as today.
    await db
      .update(schema.taskTable)
      .set({ status: "in-review" })
      .where(
        inArray(
          schema.taskTable.id,
          targets.map((task) => task.id),
        ),
      );
    const direct = await median({ status: "in-review", limit: 50 });
    expect(withChains - direct).toBeLessThan(200);
  });
});
