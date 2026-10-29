import assert from "node:assert/strict";
import test from "node:test";
import { renderPrBody, renderReport, validateRef } from "./intelia-upstream-sync.mjs";

test("validateRef: the latest release must be a stable vX.Y.Z tag", () => {
  assert.equal(validateRef("v2.48.0", false), "v2.48.0");
  assert.equal(validateRef("v2.49.12", false), "v2.49.12");

  assert.throws(() => validateRef("2.48.0", false), /Expected a release tag/);
  assert.throws(() => validateRef("main", false), /Expected a release tag/);
  assert.throws(() => validateRef("v2.48", false), /Expected a release tag/);
  assert.throws(() => validateRef("", false), /Ref must be a non-empty string/);
});

test("validateRef: an explicit ref may be any safe git ref", () => {
  assert.equal(validateRef("main", true), "main");
  assert.equal(validateRef("v2.48.0", true), "v2.48.0");
  assert.equal(validateRef("feature/sync-test", true), "feature/sync-test");

  assert.throws(() => validateRef("-bad", true), /Invalid git ref/);
  assert.throws(() => validateRef("bad..ref", true), /Invalid git ref/);
  assert.throws(() => validateRef("bad//ref", true), /Invalid git ref/);
  assert.throws(() => validateRef("bad.lock", true), /Invalid git ref/);
});

test("renderPrBody: names the candidate image after the PR head and lists what needs action", () => {
  const body = renderPrBody({
    ref: "v2.49.0",
    repo: "intelia-technologies/kaneo",
    headSha: "0123456789abcdef0123456789abcdef01234567",
    autoResolvedFiles: [".github/workflows/ci.yml"],
    addedWorkflows: [".github/workflows/mellon.yml"],
    drizzleChanged: true,
  });

  assert.ok(body.includes("https://github.com/usekaneo/kaneo/releases/tag/v2.49.0"));
  assert.ok(body.includes("ghcr.io/intelia-technologies/kaneo:candidate-0123456789ab`"));
  assert.ok(body.includes(".github/workflows/ci.yml"));
  assert.ok(body.includes(".github/workflows/mellon.yml"));
});

test("renderPrBody: a branch ref links to the upstream branch, not to a release", () => {
  const body = renderPrBody({
    ref: "main",
    repo: "intelia-technologies/kaneo",
    headSha: "0123456789abcdef0123456789abcdef01234567",
  });

  assert.ok(body.includes("https://github.com/usekaneo/kaneo/tree/main"));
  assert.ok(!body.includes("/releases/tag/"));
});

test("renderReport: a conflicts report lists every conflicted file", () => {
  const report = renderReport({
    status: "conflicts",
    ref: "v2.49.0",
    branch: "intelia/upstream-v2.49.0",
    conflictedFiles: ["package.json", "apps/api/src/index.ts"],
  });
  assert.ok(report.includes("`conflicts`"));
  assert.ok(report.includes("`package.json`"));
  assert.ok(report.includes("`apps/api/src/index.ts`"));
});
