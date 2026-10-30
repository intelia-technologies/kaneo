import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkForkCi, forkCi } from "./intelia-fork-ci.mjs";
import {
  classifyPullRequestTarget,
  pullRequestTargetAtRisk,
  buildReportData,
  parsePrepareArgs,
  renderReport,
  resolveForkCi,
  usesPullRequestTarget,
  validateRef,
  workflowsToDisable,
} from "./intelia-upstream-sync.mjs";

const UPSTREAM_CI = `name: CI
jobs:
  docker-build:
    runs-on: blacksmith-4vcpu-ubuntu-2404
    steps:
      - uses: useblacksmith/checkout@25227e61ff9dafe400e22fa487b673eac4e4409a # v1
      - name: Upgrade from the latest stable release
        env:
          GH_TOKEN: \${{ github.token }}
        run: bash scripts/ci/upgrade.sh
      - run: pnpm test
`;

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

test("parsePrepareArgs: parses flags and positional ref in any order", () => {
  assert.deepEqual(parsePrepareArgs([]), {
    noBranchCheck: false,
    reportPath: null,
    explicitRef: null,
  });

  assert.deepEqual(
    parsePrepareArgs(["--no-branch-check", "--report", "r.json", "v2.49.0"]),
    {
      noBranchCheck: true,
      reportPath: "r.json",
      explicitRef: "v2.49.0",
    },
  );

  assert.deepEqual(
    parsePrepareArgs([
      "v2.49.0",
      "--no-branch-check",
      "--report=out/report.json",
    ]),
    {
      noBranchCheck: true,
      reportPath: "out/report.json",
      explicitRef: "v2.49.0",
    },
  );

  assert.throws(
    () => parsePrepareArgs(["--report"]),
    /Missing path for --report/,
  );
  assert.throws(
    () => parsePrepareArgs(["--unknown"]),
    /Unknown option: --unknown/,
  );
  assert.throws(
    () => parsePrepareArgs(["ref1", "ref2"]),
    /Unexpected extra argument: ref2/,
  );
});

test("parsePrepareArgs: falls back to UPSTREAM_REF env var when no positional ref", () => {
  const oldEnv = process.env.UPSTREAM_REF;
  try {
    process.env.UPSTREAM_REF = "main";
    assert.deepEqual(parsePrepareArgs(["--no-branch-check"]), {
      noBranchCheck: true,
      reportPath: null,
      explicitRef: "main",
    });

    // Positional arg overrides env var
    assert.deepEqual(parsePrepareArgs(["v2.49.0"]), {
      noBranchCheck: false,
      reportPath: null,
      explicitRef: "v2.49.0",
    });
  } finally {
    if (oldEnv !== undefined) {
      process.env.UPSTREAM_REF = oldEnv;
    } else {
      delete process.env.UPSTREAM_REF;
    }
  }
});

test("buildReportData: creates contract-compliant report payload", () => {
  const defaultPayload = buildReportData({
    status: "uptodate",
    ref: "v2.48.0",
    branch: "intelia/upstream-v2.48.0",
  });

  assert.deepEqual(defaultPayload, {
    status: "uptodate",
    ref: "v2.48.0",
    branch: "intelia/upstream-v2.48.0",
    sha: "",
    changedFiles: [],
    workflowsChanged: false,
    drizzleChanged: false,
    autoResolvedFiles: [],
    addedWorkflows: [],
    conflictedFiles: [],
    activeOutsideAllowlist: [],
    pullRequestTargetWorkflows: [],
  });

  const readyPayload = buildReportData({
    status: "ready",
    ref: "v2.49.0",
    branch: "intelia/upstream-v2.49.0",
    sha: "0123456789abcdef",
    changedFiles: ["apps/api/src/index.ts", ".github/workflows/ci.yml"],
    workflowsChanged: true,
    drizzleChanged: false,
    autoResolvedFiles: [".github/workflows/ci.yml"],
    addedWorkflows: [],
  });

  assert.equal(readyPayload.status, "ready");
  assert.equal(readyPayload.sha, "0123456789abcdef");
  assert.equal(readyPayload.workflowsChanged, true);
  assert.equal(readyPayload.drizzleChanged, false);
  assert.deepEqual(readyPayload.changedFiles, [
    "apps/api/src/index.ts",
    ".github/workflows/ci.yml",
  ]);
});

test("renderReport: ready status includes details, touched count, auto-resolved, added workflows and drizzle", () => {
  const report = renderReport({
    status: "ready",
    ref: "v2.49.0",
    branch: "intelia/upstream-v2.49.0",
    sha: "0123456789abcdef",
    changedFiles: ["apps/api/src/index.ts", ".github/workflows/ci.yml"],
    autoResolvedFiles: [".github/workflows/ci.yml"],
    addedWorkflows: [".github/workflows/new.yml"],
    drizzleChanged: true,
  });

  assert.ok(report.includes("- **Estado:** `ready`"));
  assert.ok(report.includes("- **Commit:** `0123456789abcdef`"));
  assert.ok(report.includes("- **Ficheros modificados:** 2"));
  assert.ok(report.includes("<details>"));
  assert.ok(report.includes("- `apps/api/src/index.ts`"));
  assert.ok(report.includes("- `.github/workflows/ci.yml`".replace(/\\/g, "")));
  assert.ok(report.includes("</details>"));
  assert.ok(
    report.includes(
      "- **Ficheros autoresueltos:** `.github/workflows/ci.yml`".replace(
        /\\/g,
        "",
      ),
    ),
  );
  assert.ok(
    report.includes(
      "- **Nuevos workflows de upstream (a desactivar):** `.github/workflows/new.yml`".replace(
        /\\/g,
        "",
      ),
    ),
  );
  assert.ok(report.includes("- **Cambios en Drizzle:** Sí"));
});

test("renderReport: conflicts report lists every conflicted file", () => {
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

test("renderReport: uptodate and open reports have descriptive explanations", () => {
  const uptodateReport = renderReport({
    status: "uptodate",
    ref: "v2.48.0",
    branch: "intelia/upstream-v2.48.0",
  });
  assert.ok(uptodateReport.includes("ancestro de HEAD"));

  const openReport = renderReport({
    status: "open",
    ref: "v2.49.0",
    branch: "intelia/upstream-v2.49.0",
  });
  assert.ok(
    openReport.includes("Ya existe la rama `intelia/upstream-v2.49.0`"),
  );
});

test("workflowsToDisable: every active workflow outside the allowlist, whatever its name", () => {
  const workflows = [
    { id: 1, path: ".github/workflows/ci.yml", state: "active" },
    { id: 2, path: ".github/workflows/intelia-release.yml", state: "active" },
    {
      id: 3,
      path: ".github/workflows/intelia-upstream-sync.yml",
      state: "active",
    },
    { id: 4, path: ".github/workflows/intelia-candidate.yml", state: "active" },
    { id: 5, path: "dynamic/github-code-scanning/codeql", state: "active" },
    { id: 6, path: ".github/workflows/nightly.yml", state: "active" },
    { id: 7, path: ".github/workflows/agentscan.yml", state: "active" },
    {
      id: 8,
      path: ".github/workflows/release.yml",
      state: "disabled_manually",
    },
    { id: 9, path: "dynamic/dependabot/dependabot-updates", state: "active" },
    { id: 10, path: ".github/workflows/ci-intelia.yml", state: "active" },
  ];
  assert.deepEqual(
    workflowsToDisable(workflows).map((w) => w.id),
    [6, 7, 9, 10],
  );
});

test("resolveForkCi: takes upstream's new ci.yml with the runner adaptation reapplied", () => {
  const theirs = UPSTREAM_CI.replace("pnpm test", "pnpm test --coverage");
  const resolved = resolveForkCi({
    base: UPSTREAM_CI,
    ours: forkCi(UPSTREAM_CI),
    theirs,
  });
  assert.equal(resolved, forkCi(theirs));
  assert.ok(resolved.includes("pnpm test --coverage"));
  assert.ok(!resolved.includes("blacksmith"));
});

test("resolveForkCi: refuses when the fork's ci.yml carries a change of its own", () => {
  const ours = forkCi(UPSTREAM_CI) + "      - run: echo intelia-only step\n";
  const theirs = UPSTREAM_CI.replace("pnpm test", "pnpm test --coverage");
  assert.equal(resolveForkCi({ base: UPSTREAM_CI, ours, theirs }), null);
});

test("resolveForkCi: refuses when upstream's new ci.yml cannot be adapted", () => {
  const theirs = UPSTREAM_CI.replace(
    "      - run: pnpm test\n",
    "      - uses: useblacksmith/cache@v1\n      - run: pnpm test\n",
  );
  assert.equal(
    resolveForkCi({ base: UPSTREAM_CI, ours: forkCi(UPSTREAM_CI), theirs }),
    null,
  );
});

test("usesPullRequestTarget: detects the trigger in any form, ignoring comments", () => {
  assert.ok(
    usesPullRequestTarget("on:\n  pull_request_target:\n    types: [opened]\n"),
  );
  assert.ok(usesPullRequestTarget("on: [push, pull_request_target]\n"));
  assert.ok(
    !usesPullRequestTarget(
      "on:\n  pull_request:\n# pull_request_target is unsafe\n",
    ),
  );
});

test("forkCi after a clean git merge keeps the fork's own ci.yml customisations", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intelia-clean-merge-"));
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@t", ...args],
      {
        cwd: dir,
        encoding: "utf8",
      },
    );
  const ci = path.join(dir, "ci.yml");
  try {
    git("init", "-q", "-b", "upstream");
    fs.writeFileSync(ci, UPSTREAM_CI);
    git("add", "ci.yml");
    git("commit", "-qm", "upstream base");

    git("checkout", "-qb", "fork");
    const custom = forkCi(UPSTREAM_CI)
      .replace(
        "KANEO_UPGRADE_REPOSITORY: usekaneo/kaneo",
        "KANEO_UPGRADE_REPOSITORY: usekaneo/kaneo\n          INTELIA_CUSTOM_FLAG: '1'",
      )
      .replace(
        "bash scripts/ci/upgrade.sh",
        "bash scripts/ci/upgrade.sh --intelia-option",
      );
    fs.writeFileSync(ci, custom);
    git("commit", "-qam", "fork adaptation and customisation");

    git("checkout", "-q", "upstream");
    fs.writeFileSync(
      ci,
      UPSTREAM_CI.replace(
        "      - run: pnpm test\n",
        "      - run: pnpm test\n      - run: pnpm e2e\n",
      ),
    );
    git("commit", "-qam", "upstream change elsewhere");

    git("checkout", "-q", "fork");
    git("merge", "-q", "--no-ff", "--no-commit", "upstream");
    const adapted = forkCi(fs.readFileSync(ci, "utf8"));

    assert.ok(adapted.includes("INTELIA_CUSTOM_FLAG: '1'"));
    assert.ok(adapted.includes("upgrade.sh --intelia-option"));
    assert.ok(adapted.includes("- run: pnpm e2e"));
    assert.deepEqual(checkForkCi(adapted), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pull_request_target: only disabled workflows are safe; unregistered ones run on first event", () => {
  const entries = classifyPullRequestTarget(
    [
      ".github/workflows/agentscan.yml",
      ".github/workflows/auto-assign.yml",
      ".github/workflows/mellon.yml",
      ".github/workflows/slop-labeler.yml",
    ],
    [
      { path: ".github/workflows/agentscan.yml", state: "active" },
      { path: ".github/workflows/auto-assign.yml", state: "disabled_manually" },
      {
        path: ".github/workflows/slop-labeler.yml",
        state: "disabled_inactivity",
      },
    ],
  );
  assert.deepEqual(pullRequestTargetAtRisk(entries), [
    { path: ".github/workflows/agentscan.yml", state: "active" },
    { path: ".github/workflows/mellon.yml", state: "unregistered" },
  ]);
});
