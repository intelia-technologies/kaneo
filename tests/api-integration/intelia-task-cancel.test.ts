// Cancelling a task with what hangs from it (design 82, CD-02): the chain of
// the 409 against the CD-01 samples and their esquema.json, the resolutions
// applied in one transaction, the race guards, the sizes of the real chains
// and the guard switch (INTELIA_CANCEL_GUARD).
import { eq, inArray } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import * as events from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import {
  routineTable,
  taskAutomationTable,
} from "../../apps/api/src/intelia/schema";
import {
  readFixture,
  schemaErrors,
} from "../../apps/api/src/intelia/task-cancel/fixtures/read-fixture";
import * as comments from "../../apps/api/src/intelia/task-cancel/insert-comments";
import * as graphs from "../../apps/api/src/intelia/task-cancel/load-graph";
import * as webhooks from "../../apps/api/src/intelia/webhooks";
import { mockAuthenticatedSession } from "./helpers/auth";
import {
  type ChainSample,
  type Seeded,
  seedSample,
  seedWorkspace,
} from "./helpers/cancel-chain";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

type App = ReturnType<typeof createApp>["app"];
type Body = Record<string, unknown>;

beforeEach(async () => {
  await resetTestDatabase();
  vi.stubEnv("INTELIA_CANCEL_GUARD", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function setup() {
  const { user: owner, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Jaime",
  });
  mockAuthenticatedSession(owner);
  const seeded = await seedWorkspace(workspace.id, owner.id);
  // The gateway's way in: an account's API key, with the actor it declares.
  const forja = await addWorkspaceMember(workspace.id);
  const { key } = await auth.api.createApiKey({
    body: { userId: forja.id, name: "forja" },
  });
  return { app: createApp().app, owner, workspace, seeded, key };
}

async function cancel(
  app: App,
  taskId: string,
  body: Body,
  headers: Record<string, string> = {},
) {
  const res = await app.request(`/api/intelia/task/${taskId}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    body: (await res.json()) as Body & { details?: Body },
  };
}

// What the chain of SF-2491 reaches besides the sample: KF-16 hangs from KF-15
// only (another board, decision 9), KF-15 blocks two tasks of SF, and closed
// dependents do not count (decision 10).
async function seedSf2491(seeded: Seeded, extra = {}) {
  await seedSample(seeded, readFixture<ChainSample>("error-sf-2491"), extra);
  await seeded.add("KF-16");
  await seeded.relate("KF-15", "KF-16");
  await seeded.relate("KF-15", "SF-2495");
  await seeded.relate("KF-15", "SF-2499");
  await seeded.add("SF-2600", { estado: "done" });
  await seeded.relate("SF-2491", "SF-2600");
  await seeded.add("SF-2601", { estado: "cancelled" });
  await seeded.relate("SF-2491", "SF-2601");
}

const { valor: peticion } = readFixture<{ valor: Body }>("peticion-sf-2491");

async function snapshot(seeded: Seeded) {
  const ids = [...seeded.ids.values()];
  return {
    tasks: await db
      .select({
        id: schema.taskTable.id,
        status: schema.taskTable.status,
        column: schema.taskTable.columnId,
      })
      .from(schema.taskTable)
      .where(inArray(schema.taskTable.id, ids))
      .orderBy(schema.taskTable.id),
    relations: await db
      .select()
      .from(schema.taskRelationTable)
      .orderBy(schema.taskRelationTable.id),
    automation: await db
      .select()
      .from(taskAutomationTable)
      .orderBy(taskAutomationTable.taskId),
    routines: await db
      .select({ id: routineTable.id, active: routineTable.active })
      .from(routineTable),
    comments: await db
      .select({ id: schema.activityTable.id })
      .from(schema.activityTable)
      .where(eq(schema.activityTable.type, "comment")),
  };
}

describe("409 DEPENDENCIAS_SIN_RESOLVER", () => {
  it("is the sample of SF-2491, reproduced in the database, and passes esquema.json", async () => {
    const { app, seeded } = await setup();
    await seedSf2491(seeded);
    const before = await snapshot(seeded);

    const res = await cancel(app, seeded.ids.get("SF-2491")!, {});

    expect(res.status).toBe(409);
    expect(res.body).toEqual(readFixture("error-sf-2491").valor);
    expect(schemaErrors("error_dependencias", res.body)).toBeNull();
    expect(await snapshot(seeded)).toEqual(before);
  });

  it("asks for the reason with the resolutions complete (motivo.requerido)", async () => {
    const { app, seeded, key } = await setup();
    await seedSf2491(seeded);

    const { motivo: _motivo, ...withoutReason } = peticion;
    const res = await cancel(app, seeded.ids.get("SF-2491")!, withoutReason, {
      "x-api-key": key,
    });

    expect(res.status).toBe(409);
    expect(res.body.details).toMatchObject({
      motivo: { requerido: true, recibido: false },
      pendientes: [],
      problemas: [],
    });
    expect(schemaErrors("error_dependencias", res.body)).toBeNull();
  });

  it("shows a task of a project the caller does not read as hidden (decision 15)", async () => {
    const { app, seeded, workspace } = await setup();
    await seedSf2491(seeded);
    const member = await addWorkspaceMember(workspace.id);
    await restrictToProjects(workspace.id, member.id, [
      seeded.projects.get("SF")!,
    ]);
    mockAuthenticatedSession(member);

    const res = await cancel(app, seeded.ids.get("SF-2491")!, {});

    expect(res.status).toBe(409);
    const cadena = res.body.details!.cadena as Body[];
    expect(cadena[3]).toEqual({
      tipo: "oculta",
      tablero: "KF",
      nivel: 1,
      solo_si_cancelas: [],
    });
    expect(JSON.stringify(res.body)).not.toContain("KF-15");
    expect(JSON.stringify(res.body)).not.toContain("[PZ-03]");
    expect(schemaErrors("error_dependencias", res.body)).toBeNull();
  });

  it("truncates a chain of more than 200 tasks, with the real total", async () => {
    const { app, seeded } = await setup();
    await seeded.add("BIG-1");
    for (let i = 2; i <= 202; i++) {
      await seeded.add(`BIG-${i}`);
      await seeded.relate("BIG-1", `BIG-${i}`);
    }

    const res = await cancel(app, seeded.ids.get("BIG-1")!, {});

    expect(res.status).toBe(409);
    expect(res.body.details).toMatchObject({ total: 201, truncada: true });
    expect(res.body.details!.cadena).toHaveLength(200);
    expect(schemaErrors("error_dependencias", res.body)).toBeNull();
  });

  it("answers for the chain of INFRA-381 (28 tasks, 20 levels) in under a second", async () => {
    const { app, seeded } = await setup();
    const sample = readFixture<ChainSample>("error-infra-381");
    await seedSample(seeded, sample);

    const started = performance.now();
    const res = await cancel(app, seeded.ids.get("INFRA-381")!, {});
    const elapsed = performance.now() - started;

    expect(res.status).toBe(409);
    expect(res.body).toEqual(sample.valor);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe("resolutions", () => {
  it("cancel, release, move and touch the other board in one go, with the events", async () => {
    const { app, seeded, key } = await setup();
    // Automation on in KF-15 (to be turned off) and routines on the root, a
    // cascaded task and a released one.
    await seedSf2491(seeded, {
      "KF-15": { automatica: true },
      "SF-2491": { rutina_activa: true },
      "SF-2493": { rutina_activa: true },
      "SF-2495": { rutina_activa: true },
    });
    const publish = vi.spyOn(events, "publishEvent");
    const send = vi
      .spyOn(webhooks, "sendToStatusWebhooks")
      .mockResolvedValue(undefined);

    const started = performance.now();
    const res = await cancel(app, seeded.ids.get("SF-2491")!, peticion, {
      "x-api-key": key,
    });
    expect(performance.now() - started).toBeLessThan(3000);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(readFixture("resultado-sf-2491").valor);
    expect(schemaErrors("resultado", res.body)).toBeNull();

    const status = async (t: string) => (await seeded.task(t)).status;
    for (const t of ["SF-2491", "SF-2493", "SF-2494"])
      expect(await status(t)).toBe("cancelled");
    for (const t of [
      "SF-2495",
      "SF-2496",
      "SF-2505",
      "SF-2497",
      "SF-2499",
      "KF-15",
    ])
      expect(await status(t)).toBe("to-do");

    const blockers = async (t: string) =>
      (
        await db
          .select({ source: schema.taskRelationTable.sourceTaskId })
          .from(schema.taskRelationTable)
          .where(eq(schema.taskRelationTable.targetTaskId, seeded.ids.get(t)!))
      )
        .map((r) => [...seeded.ids].find(([, id]) => id === r.source)![0])
        .sort();
    expect(await blockers("SF-2495")).toEqual(["KF-15"]);
    expect(await blockers("SF-2497")).toEqual(["SF-2495", "SF-2505"]);
    expect(await blockers("SF-2499")).toEqual([
      "KF-15",
      "SF-2495",
      "SF-2496",
      "SF-2505",
    ]);
    expect(await blockers("KF-15")).toEqual([]);

    const [kf15] = await db
      .select()
      .from(taskAutomationTable)
      .where(eq(taskAutomationTable.taskId, seeded.ids.get("KF-15")!));
    expect(kf15).toMatchObject({
      automatica: false,
      level: "manual",
      pausaMotivo:
        "Dependencia cancelada: SF-2491 (Se parte el diseño de la pausa de ámbito en dos fases.)",
      setByActor: "agent:forja",
    });

    const routines = await db
      .select({ taskId: routineTable.taskId, active: routineTable.active })
      .from(routineTable);
    const active = Object.fromEntries(
      routines.map((r) => [
        [...seeded.ids].find(([, id]) => id === r.taskId)![0],
        r.active,
      ]),
    );
    expect(active).toEqual({
      "SF-2491": false,
      "SF-2493": false,
      "SF-2495": true,
    });

    const written = await db
      .select({
        taskId: schema.activityTable.taskId,
        content: schema.activityTable.content,
        externalUserName: schema.activityTable.externalUserName,
      })
      .from(schema.activityTable)
      .where(eq(schema.activityTable.type, "comment"));
    const byTask = Object.fromEntries(
      written.map((c) => [
        [...seeded.ids].find(([, id]) => id === c.taskId)![0],
        c.content,
      ]),
    );
    expect(written).toHaveLength(9);
    expect(new Set(written.map((c) => c.externalUserName))).toEqual(
      new Set(["Forja"]),
    );
    const m =
      "Motivo: «Se parte el diseño de la pausa de ámbito en dos fases.».";
    expect(byTask).toEqual({
      "SF-2491": `Cancelada por Forja. ${m} Se cancelan también: SF-2493, SF-2494; se quita la dependencia a: SF-2495, SF-2496, SF-2505, SF-2497; se mueve a otra tarea: SF-2499 (de SF-2493, SF-2494 a SF-2496); otros tableros, automático: KF-15. Esta tarea tenía una rutina activa: queda en pausa para que no la reabra.`,
      "SF-2493": `Cancelada en cascada: Forja canceló SF-2491 y eligió cancelar también esta tarea (dependía de SF-2491). ${m} Esta tarea tenía una rutina activa: queda en pausa para que no la reabra.`,
      "SF-2494": `Cancelada en cascada: Forja canceló SF-2491 y eligió cancelar también esta tarea (dependía de SF-2493). ${m}`,
      "SF-2495": `Forja canceló SF-2491. ${m} Decisión: se quita la dependencia de SF-2491; esta tarea sigue viva.`,
      "SF-2496": `Forja canceló SF-2491. ${m} Decisión: se quita la dependencia de SF-2491; esta tarea sigue viva.`,
      "SF-2505": `Forja canceló SF-2491 y, en cascada, SF-2493. ${m} Decisión: se quita la dependencia de SF-2493; esta tarea sigue viva.`,
      "SF-2497": `Forja canceló SF-2491 y, en cascada, SF-2494. ${m} Decisión: se quita la dependencia de SF-2494; esta tarea sigue viva.`,
      "SF-2499": `Forja canceló SF-2491 y, en cascada, SF-2493, SF-2494. ${m} Decisión: la dependencia pasa de SF-2493, SF-2494 a SF-2496.`,
      "KF-15": `Forja canceló SF-2491 (tablero SF). ${m} Se ha quitado la dependencia y se ha apagado la automática de esta tarea por si acaso. @agent:forja, revisa si debe seguir adelante.`,
    });

    const statusChanged = publish.mock.calls
      .filter(([type]) => type === "task.status_changed")
      .map(([, data]) => (data as { taskId: string }).taskId);
    expect(statusChanged.sort()).toEqual(
      ["SF-2491", "SF-2493", "SF-2494"].map((t) => seeded.ids.get(t)!).sort(),
    );
    const sent = send.mock.calls.filter(
      ([type]) => type === "intelia.task.cancelled_with_dependents",
    );
    expect(sent).toHaveLength(1);
    const [, rootId, projectId, , data] = sent[0]!;
    expect([rootId, projectId]).toEqual([
      seeded.ids.get("SF-2491"),
      seeded.projects.get("SF"),
    ]);
    const { valor: evento } = readFixture<{ valor: Body }>("evento-sf-2491");
    expect(data).toEqual({
      ...evento,
      otros_tableros: [
        {
          tarea: "KF-15",
          proyecto: seeded.projects.get("KF"),
          responsable: "agent:forja",
        },
      ],
      en: expect.any(String),
    });
    expect(schemaErrors("evento", data)).toBeNull();
    expect(
      send.mock.calls.filter(([type]) => type === "task.automation_changed"),
    ).toHaveLength(1);
  });

  it("leave nothing changed when the last step fails", async () => {
    const { app, seeded, key } = await setup();
    await seedSf2491(seeded, {
      "KF-15": { automatica: true },
      "SF-2491": { rutina_activa: true },
    });
    const before = await snapshot(seeded);
    vi.spyOn(comments, "insertComments").mockRejectedValueOnce(
      new Error("simulated failure"),
    );
    const publish = vi.spyOn(events, "publishEvent");

    const res = await cancel(app, seeded.ids.get("SF-2491")!, peticion, {
      "x-api-key": key,
    });

    expect(res.status).toBe(500);
    expect(await snapshot(seeded)).toEqual(before);
    expect(
      publish.mock.calls.filter(([type]) => type === "task.status_changed"),
    ).toEqual([]);
  });

  it("give cadena_cambiada, and change nothing, when a dependent arrives meanwhile", async () => {
    const { app, seeded, key } = await setup();
    await seedSf2491(seeded);
    const loadGraph = graphs.loadGraph;
    // The new dependent lands between the check and the lock.
    vi.spyOn(graphs, "loadGraph").mockImplementationOnce(async (...args) => {
      const graph = await loadGraph(...args);
      await seeded.add("SF-2700", { titulo: "Nueva" });
      await seeded.relate("SF-2491", "SF-2700");
      return graph;
    });
    const before = await snapshot(seeded);

    const res = await cancel(app, seeded.ids.get("SF-2491")!, peticion, {
      "x-api-key": key,
    });

    expect(res.status).toBe(409);
    expect(res.body.details!.problemas).toEqual([
      {
        tarea: "SF-2700",
        problema: "cadena_cambiada",
        detalle: "Ha entrado en la cadena después de que la vieras.",
      },
      {
        tarea: "SF-2700",
        problema: "falta",
        detalle:
          "Está en juego y no tiene resolución: elige cancelar, quitar o mover.",
      },
    ]);
    expect(schemaErrors("error_dependencias", res.body)).toBeNull();
    const after = await snapshot(seeded);
    expect(
      after.tasks.filter((t) => t.id !== seeded.ids.get("SF-2700")),
    ).toEqual(before.tasks);
    expect(after.automation).toEqual(before.automation);
    expect(after.comments).toEqual([]);
  });

  it("let one of two overlapping cancellations win; the other gets a 409, without a deadlock", async () => {
    const { app, seeded, key } = await setup();
    // A and B share X; each has one of its own.
    for (const t of ["OV-1", "OV-2", "OV-3", "OV-4", "OV-5"])
      await seeded.add(t);
    await seeded.relate("OV-1", "OV-3");
    await seeded.relate("OV-2", "OV-3");
    await seeded.relate("OV-1", "OV-4");
    await seeded.relate("OV-2", "OV-5");
    const motivo = "Dos cancelaciones a la vez sobre la misma rama.";

    const results = await Promise.all([
      cancel(
        app,
        seeded.ids.get("OV-1")!,
        {
          motivo,
          resoluciones: [
            { tarea: "OV-3", accion: "cancelar" },
            { tarea: "OV-4", accion: "quitar" },
          ],
        },
        { "x-api-key": key },
      ),
      cancel(
        app,
        seeded.ids.get("OV-2")!,
        {
          motivo,
          resoluciones: [
            { tarea: "OV-3", accion: "cancelar" },
            { tarea: "OV-5", accion: "quitar" },
          ],
        },
        { "x-api-key": key },
      ),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const lost = results.find((r) => r.status === 409)!;
    // Its chain lost OV-3 under the lock (cadena_cambiada) or, if it read it
    // after the winner committed, OV-3 is no longer in it (sobra).
    expect(lost.body.error).toBe("DEPENDENCIAS_SIN_RESOLVER");
    expect(
      (
        lost.body.details!.problemas as { tarea: string; problema: string }[]
      ).filter((p) => p.tarea === "OV-3"),
    ).not.toEqual([]);
    const winner = results.find((r) => r.status === 200)!.body
      .canceladas as string[];
    const loser = ["OV-1", "OV-2"].find((t) => !winner.includes(t))!;
    expect((await seeded.task(loser)).status).toBe("to-do");
  });

  it("cancel all of INFRA-381 (28 tasks) in under three seconds", async () => {
    const { app, seeded, key } = await setup();
    const sample = readFixture<ChainSample>("error-infra-381");
    await seedSample(seeded, sample);
    const resoluciones = sample.valor.details.cadena.map((n) => ({
      tarea: n.ticket,
      accion: "cancelar",
    }));

    const started = performance.now();
    const res = await cancel(
      app,
      seeded.ids.get("INFRA-381")!,
      { motivo: "Se replantea la migración entera.", resoluciones },
      { "x-api-key": key },
    );
    const elapsed = performance.now() - started;

    expect(res.status).toBe(200);
    expect(res.body.canceladas).toHaveLength(29);
    expect(elapsed).toBeLessThan(3000);
    const statuses = await db
      .select({ status: schema.taskTable.status })
      .from(schema.taskTable)
      .where(inArray(schema.taskTable.id, [...seeded.ids.values()]));
    expect(new Set(statuses.map((s) => s.status))).toEqual(
      new Set(["cancelled"]),
    );
  });
});

describe("as before", () => {
  it("cancels a task without dependents, with its reason as a comment", async () => {
    const { app, seeded } = await setup();
    await seeded.add("SOLO-1");
    const publish = vi.spyOn(events, "publishEvent");

    const res = await cancel(app, seeded.ids.get("SOLO-1")!, {
      motivo: "Ya no hace falta.",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      canceladas: ["SOLO-1"],
      quitadas: [],
      movidas: [],
      otros_tableros: [],
      comentarios: 1,
    });
    expect(schemaErrors("resultado", res.body)).toBeNull();
    expect((await seeded.task("SOLO-1")).status).toBe("cancelled");
    expect(
      publish.mock.calls.filter(([type]) => type === "task.status_changed"),
    ).toHaveLength(1);
  });

  it("cancels only the task with the guard off and no resolutions, dependents and all", async () => {
    vi.stubEnv("INTELIA_CANCEL_GUARD", "");
    const { app, seeded } = await setup();
    await seedSf2491(seeded);
    const relations = (await snapshot(seeded)).relations;

    const res = await cancel(app, seeded.ids.get("SF-2491")!, {});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      canceladas: ["SF-2491"],
      quitadas: [],
      movidas: [],
      otros_tableros: [],
      comentarios: 0,
    });
    expect((await seeded.task("SF-2491")).status).toBe("cancelled");
    expect((await seeded.task("SF-2493")).status).toBe("to-do");
    expect((await snapshot(seeded)).relations).toEqual(relations);
  });

  it("still applies resolutions with the guard off", async () => {
    vi.stubEnv("INTELIA_CANCEL_GUARD", "");
    const { app, seeded, key } = await setup();
    await seedSf2491(seeded);

    const res = await cancel(app, seeded.ids.get("SF-2491")!, peticion, {
      "x-api-key": key,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(readFixture("resultado-sf-2491").valor);
  });
});
