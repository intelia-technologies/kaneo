import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const script = path.join(root, "scripts/ci/intelia-upstream-sync.mjs");

function exercise(mode) {
  const dir = fs.mkdtempSync(path.join(root, ".test-workflows-"));
  try {
    const state = path.join(dir, "state.json");
    fs.writeFileSync(state, JSON.stringify({ disabled: false, calls: [] }));
    fs.writeFileSync(
      path.join(dir, "gh"),
      `#!/usr/bin/env node
import fs from 'node:fs';
const state = JSON.parse(fs.readFileSync(process.env.TEST_STATE));
const args = process.argv.slice(2);
const endpoint = args.at(-1);
state.calls.push(args);
const save = () => fs.writeFileSync(process.env.TEST_STATE, JSON.stringify(state));
if (process.env.TEST_MODE === 'forbidden') { console.error('HTTP 403'); process.exit(1); }
if (endpoint.includes('/workflows?')) {
  console.log(JSON.stringify([{ workflows: [
    { id: 1, path: '.github/workflows/upstream.yml', state: state.disabled ? 'disabled_manually' : 'active' },
    { id: 2, path: '.github/workflows/old.yml', state: 'disabled_manually' },
    { id: 3, path: '.github/workflows/intelia-ci.yml', state: 'active' }
  ] }]));
} else if (endpoint.endsWith('/disable')) { state.disabled = true;
} else if (endpoint.includes('/runs?')) {
  const waiting = endpoint.includes('status=waiting');
  const id = waiting ? 103 : (endpoint.includes('/1/') ? 101 : 102);
  console.log(JSON.stringify([{workflow_runs: waiting && !endpoint.includes('/1/') ? [] : [{id}]}]));
} else if (endpoint.endsWith('/cancel')) {
  if (process.env.TEST_MODE === 'zombie' && endpoint.includes('/102/')) { save(); console.error('not queued yet'); process.exit(1); }
} else if (endpoint.includes('/actions/runs/')) {
  console.log(JSON.stringify({status:'completed', conclusion: process.env.TEST_MODE === 'not-cancelled' ? 'success' : 'cancelled'}));
} else { console.error('unexpected: ' + endpoint); process.exit(1); }
save();
`,
      { mode: 0o755 },
    );
    const result = spawnSync(process.execPath, [script, "disable-workflows"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        GITHUB_REPOSITORY: "test/repo",
        TEST_STATE: state,
        TEST_MODE: mode,
      },
    });
    return { result, calls: JSON.parse(fs.readFileSync(state, "utf8")).calls };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("disable and verify cancellation for active and already disabled upstream workflows, not allowlisted ones", () => {
  const { result, calls } = exercise("normal");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Run 101: cancelled/);
  assert.match(result.stdout, /Run 102: cancelled/);
  assert.match(result.stdout, /Run 103: cancelled/);
  assert.ok(calls.some((a) => a.at(-1).endsWith("/workflows/1/disable")));
  assert.ok(!calls.some((a) => a.at(-1).includes("/workflows/3/")));
  assert.ok(
    calls.some((a) => a.at(-1).includes("/workflows/2/runs?status=waiting")),
  );
});

test("zombie cancellation is a warning but other runs are checked", () => {
  const { result } = exercise("zombie");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /warning.*102.*not queued yet/);
  assert.match(result.stdout, /Run 101: cancelled/);
});

test("API failures and completed runs not cancelled fail closed", () => {
  assert.notEqual(exercise("forbidden").result.status, 0);
  const { result } = exercise("not-cancelled");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no cancelled/);
});
