import { describe, expect, it } from "vite-plus/test";
import { executorKind } from "./executor";

describe("executorKind", () => {
  it("tells ephemeral and persistent agents from people by the account", () => {
    expect(executorKind("role-coder@inteliatech.internal")).toBe("ephemeral");
    expect(executorKind("agent-orq-jaime@inteliatech.internal")).toBe(
      "persistent",
    );
    expect(executorKind("svc-despachador@inteliatech.internal")).toBe(
      "persistent",
    );
    expect(executorKind("jaime@inteliatech.ai")).toBe("person");
    expect(executorKind(null)).toBeNull();
  });
});
