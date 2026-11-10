// Intelia fork (README-INTELIA.md, «CI y versiones»; design 58): the fork is public,
// so its workflows run only on GitHub-hosted ubuntu-24.04 runners, never on our own
// (a self-hosted runner would run code from anyone's PR), and every action is pinned
// to a full commit SHA. Checks .github/workflows/intelia-*.yml; exits 1 on violations.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";

export const RUNNER = "ubuntu-24.04";
const PINNED = /^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/;
const LOCAL_WORKFLOW = /^\.\/\.github\/workflows\/[\w.-]+\.ya?ml$/;

/** Violations of the runner and pinning policy in one workflow file. */
export function checkWorkflow(file, text) {
  const problems = [];
  const workflow = parse(text);
  const jobs = workflow?.jobs;
  if (!jobs || typeof jobs !== "object") return [`${file}: no jobs`];
  for (const [id, job] of Object.entries(jobs)) {
    const where = `${file}: job ${id}`;
    if (job?.uses !== undefined) {
      // A reusable workflow of this repo is checked on its own; others are not allowed.
      if (!LOCAL_WORKFLOW.test(job.uses))
        problems.push(
          `${where} calls ${job.uses}; only this repo's workflows (./.github/workflows/…)`,
        );
      continue;
    }
    if (job?.["runs-on"] !== RUNNER)
      problems.push(
        `${where} runs on ${JSON.stringify(job?.["runs-on"])}; only GitHub's ${RUNNER}`,
      );
    if (job?.container !== undefined || job?.services !== undefined)
      problems.push(
        `${where} declares a container or services; run them from steps instead`,
      );
    for (const [i, step] of (job?.steps ?? []).entries()) {
      if (step?.uses === undefined) continue;
      if (!PINNED.test(step.uses) && !step.uses.startsWith("./"))
        problems.push(
          `${where} step ${step.name ?? i + 1} uses ${step.uses}; pin it to a full commit SHA`,
        );
    }
  }
  return problems;
}

function main() {
  const dir = ".github/workflows";
  const files = readdirSync(dir).filter((f) => /^intelia-.*\.ya?ml$/.test(f));
  if (files.length === 0) throw new Error(`No intelia-*.yml in ${dir}`);
  const problems = files.flatMap((f) =>
    checkWorkflow(join(dir, f), readFileSync(join(dir, f), "utf8")),
  );
  for (const p of problems) console.error(`::error::${p}`);
  if (problems.length > 0) process.exit(1);
  console.log(
    `${files.length} intelia-*.yml: GitHub ${RUNNER} runners and SHA-pinned actions`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
