import { describe, expect, it } from "vite-plus/test";
import {
  type BlockerFacts,
  blockerPerson,
  blockerState,
  notStartingReason,
  worstReason,
} from "./state";

const facts = (extra: Partial<BlockerFacts>): BlockerFacts => ({
  status: "to-do",
  assigneeKind: "ephemeral",
  assigneeName: "coder",
  hasDecisionLabel: false,
  esperaA: null,
  ...extra,
});

describe("blockerState", () => {
  it("sorts each column into its state", () => {
    for (const status of ["in-progress", "in-review", "ready-to-merge"])
      expect(blockerState(facts({ status }))).toBe("in_progress");
    for (const status of ["backlog", "to-do", "queued"])
      expect(blockerState(facts({ status }))).toBe("not_started");
    expect(blockerState(facts({ status: "cancelled" }))).toBe("cancelled");
  });

  it("counts Blocked without a person signal as blocked", () => {
    expect(blockerState(facts({ status: "blocked" }))).toBe("blocked");
    expect(blockerState(facts({ status: "blocked", esperaA: "SF-9" }))).toBe(
      "blocked",
    );
  });

  it("waits for a person by assignee, decision label or Blocked signal", () => {
    const assigned = facts({
      status: "in-progress",
      assigneeKind: "person",
      assigneeName: "Jaime",
    });
    expect(blockerState(assigned)).toBe("person");
    expect(blockerPerson(assigned)).toBe("Jaime");

    const decision = facts({ hasDecisionLabel: true });
    expect(blockerState(decision)).toBe("person");
    expect(blockerPerson(decision)).toBeNull();

    const waiting = facts({ status: "blocked", esperaA: "person:pablo" });
    expect(blockerState(waiting)).toBe("person");
    expect(blockerPerson(waiting)).toBe("person:pablo");
    // The signal only counts in Blocked: it may lag behind a move.
    expect(
      blockerState(facts({ status: "to-do", esperaA: "person:pablo" })),
    ).toBe("not_started");
  });

  it("keeps cancelled above person", () => {
    expect(
      blockerState(facts({ status: "cancelled", assigneeKind: "person" })),
    ).toBe("cancelled");
  });
});

describe("worstReason", () => {
  it("takes the worst state, external between not started and in progress", () => {
    expect(worstReason([], 0)).toBe("ready");
    expect(worstReason(["in_progress", "not_started"], 0)).toBe("not_started");
    expect(worstReason(["in_progress"], 1)).toBe("external");
    expect(worstReason(["blocked", "person"], 0)).toBe("person");
    expect(worstReason(["person", "cancelled"], 0)).toBe("cancelled");
  });
});

describe("notStartingReason", () => {
  const ready = {
    automatica: true,
    pausaMotivo: null,
    assigneeKind: "ephemeral" as const,
    waitingRelease: false,
  };

  it("is null when the dispatcher will start it", () => {
    expect(notStartingReason(ready)).toBeNull();
  });

  it("says each reason", () => {
    expect(
      notStartingReason({
        ...ready,
        automatica: false,
        pausaMotivo: "movida_a_mano",
      }),
    ).toBe("paused");
    expect(notStartingReason({ ...ready, automatica: false })).toBe(
      "automation_off",
    );
    expect(notStartingReason({ ...ready, automatica: null })).toBe(
      "automation_off",
    );
    expect(notStartingReason({ ...ready, assigneeKind: null })).toBe("no_role");
    expect(notStartingReason({ ...ready, assigneeKind: "person" })).toBe(
      "no_role",
    );
    expect(notStartingReason({ ...ready, waitingRelease: true })).toBe(
      "waiting_release",
    );
  });
});
