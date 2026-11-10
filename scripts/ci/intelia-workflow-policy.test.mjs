import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { checkWorkflow } from "./intelia-workflow-policy.mjs";

const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const workflow = (job) =>
  `on: workflow_dispatch\njobs:\n  build:\n${job
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n")}\n`;

test("a GitHub ubuntu-24.04 job with SHA-pinned and local actions passes", () => {
  assert.deepEqual(
    checkWorkflow(
      "ok.yml",
      workflow(
        `runs-on: ubuntu-24.04\nsteps:\n  - uses: actions/checkout@${SHA} # v7\n  - uses: github/codeql-action/init@${SHA}\n  - uses: ./.github/actions/local\n  - run: echo`,
      ),
    ),
    [],
  );
  assert.deepEqual(
    checkWorkflow(
      "reuse.yml",
      "on: push\njobs:\n  ci:\n    uses: ./.github/workflows/intelia-ci.yml\n",
    ),
    [],
  );
});

test("a self-hosted or other runner is rejected", () => {
  for (const runner of [
    "self-hosted",
    "[self-hosted, linux]",
    "galaxia-ci",
    "ubuntu-latest",
    "$" + "{{ inputs.runner }}",
    "{ group: metal }",
  ]) {
    const problems = checkWorkflow(
      "bad.yml",
      workflow(`runs-on: ${runner}\nsteps:\n  - run: echo`),
    );
    assert.equal(problems.length, 1, runner);
    assert.match(problems[0], /only GitHub's ubuntu-24\.04/);
  }
  assert.match(
    checkWorkflow("none.yml", workflow("steps:\n  - run: echo"))[0],
    /runs on undefined/,
  );
});

test("an action not pinned to a full SHA is rejected", () => {
  for (const ref of [
    "actions/checkout@v7",
    "actions/checkout@main",
    `actions/checkout@${SHA.slice(0, 12)}`,
    "actions/checkout",
    "docker://alpine:3",
  ]) {
    const problems = checkWorkflow(
      "bad.yml",
      workflow(`runs-on: ubuntu-24.04\nsteps:\n  - uses: ${ref}`),
    );
    assert.equal(problems.length, 1, ref);
    assert.match(problems[0], /pin it to a full commit SHA/);
  }
});

test("other repos' reusable workflows and job containers are rejected", () => {
  assert.match(
    checkWorkflow(
      "bad.yml",
      `on: push\njobs:\n  x:\n    uses: someone/repo/.github/workflows/ci.yml@${SHA}\n`,
    )[0],
    /only this repo's workflows/,
  );
  assert.match(
    checkWorkflow(
      "bad.yml",
      workflow(
        "runs-on: ubuntu-24.04\ncontainer: node:24\nsteps:\n  - run: echo",
      ),
    )[0],
    /container or services/,
  );
});

test("the fork's intelia-*.yml follow the policy", () => {
  const dir = ".github/workflows";
  const files = readdirSync(dir).filter((f) => /^intelia-.*\.ya?ml$/.test(f));
  assert.ok(files.includes("intelia-release.yml"));
  for (const f of files)
    assert.deepEqual(
      checkWorkflow(f, readFileSync(`${dir}/${f}`, "utf8")),
      [],
      f,
    );
});
