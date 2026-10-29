import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { assertForkCi, forkCi } from "./intelia-fork-ci.mjs";

const UPSTREAM_REPO_URL = "https://github.com/usekaneo/kaneo.git";

export function validateRef(ref, isExplicit = false) {
  if (!ref || typeof ref !== "string") {
    throw new Error("Ref must be a non-empty string");
  }
  const trimmed = ref.trim();
  if (isExplicit) {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(trimmed) ||
      trimmed.includes("..") ||
      trimmed.includes("//") ||
      trimmed.endsWith("/") ||
      trimmed.endsWith(".lock")
    ) {
      throw new Error(`Invalid git ref: "${trimmed}"`);
    }
    return trimmed;
  }
  if (!/^v\d+\.\d+\.\d+$/.test(trimmed)) {
    throw new Error(
      `Expected a release tag matching ^v\\d+\\.\\d+\\.\\d+$, got "${trimmed}"`,
    );
  }
  return trimmed;
}

export function getBranchName(ref) {
  return `intelia/upstream-${ref}`;
}

export function parsePrepareArgs(args = []) {
  let noBranchCheck = false;
  let reportPath = null;
  let explicitRef = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--no-branch-check") {
      noBranchCheck = true;
    } else if (arg === "--report") {
      if (i + 1 < args.length) {
        reportPath = args[++i];
      } else {
        throw new Error("Missing path for --report");
      }
    } else if (arg.startsWith("--report=")) {
      reportPath = arg.slice("--report=".length);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      if (!explicitRef) {
        explicitRef = arg;
      } else {
        throw new Error(`Unexpected extra argument: ${arg}`);
      }
    }
  }

  if (!explicitRef && process.env.UPSTREAM_REF && process.env.UPSTREAM_REF.trim()) {
    explicitRef = process.env.UPSTREAM_REF.trim();
  }

  return { noBranchCheck, reportPath, explicitRef };
}

export function buildReportData({
  status,
  ref,
  branch,
  sha = "",
  changedFiles = [],
  workflowsChanged = false,
  drizzleChanged = false,
  autoResolvedFiles = [],
  addedWorkflows = [],
  conflictedFiles = [],
}) {
  return {
    status,
    ref,
    branch,
    sha,
    changedFiles,
    workflowsChanged,
    drizzleChanged,
    autoResolvedFiles,
    addedWorkflows,
    conflictedFiles,
  };
}

export function renderReport({
  status,
  ref,
  branch,
  sha = "",
  changedFiles = [],
  autoResolvedFiles = [],
  addedWorkflows = [],
  drizzleChanged = false,
  conflictedFiles = [],
}) {
  let md = `## Sincronización con upstream: ${ref}\n\n`;
  md += `- **Estado:** \`${status}\`\n`;
  md += `- **Rama:** \`${branch}\`\n`;

  if (status === "ready") {
    if (sha) {
      md += `- **Commit:** \`${sha}\`\n`;
    }
    md += `- **Ficheros modificados:** ${changedFiles.length}\n`;
    if (changedFiles.length > 0) {
      md += `\n<details>\n<summary>Lista completa de ficheros modificados (${changedFiles.length})</summary>\n\n`;
      md += changedFiles.map((f) => `- \`${f}\``).join("\n") + "\n";
      md += `</details>\n\n`;
    } else {
      md += "\n";
    }
    md += `- **Ficheros autoresueltos:** ${
      autoResolvedFiles.length > 0
        ? autoResolvedFiles.map((f) => `\`${f}\``).join(", ")
        : "Ninguno"
    }\n`;
    md += `- **Nuevos workflows de upstream (a desactivar):** ${
      addedWorkflows.length > 0
        ? addedWorkflows.map((w) => `\`${w}\``).join(", ")
        : "Ninguno"
    }\n`;
    md += `- **Cambios en Drizzle:** ${drizzleChanged ? "Sí" : "No"}\n`;
  } else if (status === "uptodate") {
    md += `\nLa referencia de upstream \`${ref}\` ya es ancestro de HEAD. No se requiere sincronización.\n`;
  } else if (status === "open") {
    md += `\nYa existe la rama \`${branch}\` en el fork (con o sin pull request). No se sobreescribe el trabajo humano: abre la PR desde esa rama o bórrala para regenerarla.\n`;
  } else if (status === "conflicts") {
    md += `\n### Conflictos no resolubles automáticamente\n`;
    md += `Se ha abortado el merge debido a conflictos en:\n`;
    md += conflictedFiles.map((f) => `- \`${f}\``).join("\n") + "\n";
  }

  return md;
}

function execGit(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function getGitIdentityArgs() {
  const name =
    process.env.GIT_AUTHOR_NAME ||
    process.env.GIT_COMMITTER_NAME ||
    "github-actions[bot]";
  const email =
    process.env.GIT_AUTHOR_EMAIL ||
    process.env.GIT_COMMITTER_EMAIL ||
    "41898282+github-actions[bot]@users.noreply.github.com";

  return [
    "-c",
    `user.name=${name}`,
    "-c",
    `user.email=${email}`,
    "-c",
    `author.name=${name}`,
    "-c",
    `author.email=${email}`,
    "-c",
    `committer.name=${name}`,
    "-c",
    `committer.email=${email}`,
  ];
}

function writeOutputs(outputs) {
  if (process.env.GITHUB_OUTPUT) {
    const lines =
      Object.entries(outputs)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n";
    fs.appendFileSync(process.env.GITHUB_OUTPUT, lines, "utf8");
  }
}

function writeSummary(report) {
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n", "utf8");
  }
}

export async function prepare(optsOrRef = {}) {
  const opts =
    typeof optsOrRef === "string"
      ? { explicitRef: optsOrRef }
      : optsOrRef;
  const {
    explicitRef: explicitRefArg = null,
    noBranchCheck = false,
    reportPath = null,
  } = opts;

  let ref;
  let isExplicit = false;

  if (explicitRefArg) {
    ref = validateRef(explicitRefArg, true);
    isExplicit = true;
  } else {
    const latestRaw = execFileSync(
      "gh",
      ["api", "repos/usekaneo/kaneo/releases/latest", "--jq", ".tag_name"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    ref = validateRef(latestRaw, false);
  }

  const branch = getBranchName(ref);

  // Fetch target ref from upstream without tags flood
  try {
    if (ref.startsWith("v")) {
      execGit([
        "fetch",
        "--no-tags",
        UPSTREAM_REPO_URL,
        `+refs/tags/${ref}:refs/tags/${ref}`,
      ]);
    } else {
      execGit([
        "fetch",
        "--no-tags",
        UPSTREAM_REPO_URL,
        `+refs/heads/${ref}:refs/remotes/upstream/${ref}`,
      ]);
    }
  } catch {
    // Not a tag or branch name (e.g. a commit SHA): fetch it into FETCH_HEAD.
    execGit(["fetch", "--no-tags", UPSTREAM_REPO_URL, ref]);
  }

  const targetCommit = execGit(["rev-parse", "FETCH_HEAD^{commit}"]).trim();

  // Check if target is already ancestor of HEAD
  let isAncestor = false;
  try {
    execGit(["merge-base", "--is-ancestor", targetCommit, "HEAD"]);
    isAncestor = true;
  } catch {
    isAncestor = false;
  }

  if (isAncestor) {
    const status = "uptodate";
    const reportData = buildReportData({ status, ref, branch });
    if (reportPath) {
      fs.writeFileSync(
        reportPath,
        JSON.stringify(reportData, null, 2) + "\n",
        "utf8",
      );
    }
    writeOutputs({
      status,
      ref,
      branch,
      sha: "",
      workflows_changed: "false",
    });
    const report = renderReport(reportData);
    writeSummary(report);
    return reportData;
  }

  // Never clobber an existing sync branch (open PR or manual conflict resolution in progress).
  if (!noBranchCheck) {
    const repo = process.env.GITHUB_REPOSITORY;
    if (repo) {
      const prs = JSON.parse(
        execFileSync(
          "gh",
          [
            "pr",
            "list",
            "--repo",
            repo,
            "--head",
            branch,
            "--state",
            "open",
            "--json",
            "number",
          ],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        ),
      );
      const remoteBranch = execGit([
        "ls-remote",
        "--heads",
        `https://github.com/${repo}.git`,
        `refs/heads/${branch}`,
      ]).trim();
      if (prs.length > 0 || remoteBranch) {
        const status = "open";
        const reportData = buildReportData({ status, ref, branch });
        if (reportPath) {
          fs.writeFileSync(
            reportPath,
            JSON.stringify(reportData, null, 2) + "\n",
            "utf8",
          );
        }
        writeOutputs({
          status,
          ref,
          branch,
          sha: "",
          workflows_changed: "false",
        });
        writeSummary(renderReport(reportData));
        return reportData;
      }
    }
  }

  // `checkout -b` refuses to reuse an existing local branch.
  execGit(["checkout", "-b", branch, "HEAD"]);
  // Attempt merge --no-ff --no-commit
  const identity = getGitIdentityArgs();
  let mergeError;
  try {
    execGit([
      ...identity,
      "merge",
      "--no-ff",
      "--no-commit",
      targetCommit,
      "-m",
      `chore: merge upstream ${ref}`,
    ]);
  } catch (err) {
    mergeError = err;
  }

  const unmerged = execGit(["diff", "--name-only", "--diff-filter=U"])
    .trim()
    .split("\n")
    .filter(Boolean);
  // A merge that stops without unmerged paths failed for another reason: surface it.
  if (mergeError && unmerged.length === 0) throw mergeError;

  const autoResolvedFiles = [];
  if (unmerged.length > 0) {
    const otherConflicts = unmerged.filter(
      (f) => f !== ".github/workflows/ci.yml",
    );
    if (otherConflicts.length > 0) {
      execGit(["merge", "--abort"]);
      const status = "conflicts";
      const reportData = buildReportData({
        status,
        ref,
        branch,
        conflictedFiles: unmerged,
      });
      if (reportPath) {
        fs.writeFileSync(
          reportPath,
          JSON.stringify(reportData, null, 2) + "\n",
          "utf8",
        );
      }
      writeOutputs({
        status,
        ref,
        branch,
        sha: "",
        workflows_changed: "false",
      });
      for (const f of unmerged) {
        console.error(`::error file=${f}::Merge conflict in ${f}`);
      }
      const report = renderReport(reportData);
      writeSummary(report);
      process.exit(1);
    }

    // Only .github/workflows/ci.yml is in conflict
    execGit(["checkout", "--theirs", "--", ".github/workflows/ci.yml"]);
    autoResolvedFiles.push(".github/workflows/ci.yml");
  }

  // ALWAYS apply forkCi to ci.yml after merge (upstream may add new blacksmith jobs)
  if (fs.existsSync(".github/workflows/ci.yml")) {
    const ciContent = fs.readFileSync(".github/workflows/ci.yml", "utf8");
    const adapted = forkCi(ciContent);
    assertForkCi(adapted);
    fs.writeFileSync(".github/workflows/ci.yml", adapted, "utf8");
    execGit(["add", ".github/workflows/ci.yml"]);
  }

  // Commit the merge
  execGit([...identity, "commit", "-m", `chore: merge upstream ${ref}`]);

  const sha = execGit(["rev-parse", "HEAD"]).trim();

  const changedFiles = execGit(["diff", "--name-only", "HEAD^1", "HEAD"])
    .trim()
    .split("\n")
    .filter(Boolean);

  const workflowsChanged = changedFiles.some((f) =>
    f.startsWith(".github/workflows/"),
  );

  const drizzleFiles = execGit([
    "diff",
    "--name-only",
    "HEAD^1",
    "HEAD",
    "--",
    "apps/api/drizzle",
  ])
    .trim()
    .split("\n")
    .filter(Boolean);

  const drizzleChanged = drizzleFiles.length > 0;

  const addedWorkflows = execGit([
    "diff",
    "--name-only",
    "--diff-filter=A",
    "HEAD^1",
    "HEAD",
    "--",
    ".github/workflows",
  ])
    .trim()
    .split("\n")
    .filter(Boolean);

  const status = "ready";
  const reportData = buildReportData({
    status,
    ref,
    branch,
    sha,
    changedFiles,
    workflowsChanged,
    drizzleChanged,
    autoResolvedFiles,
    addedWorkflows,
  });

  if (reportPath) {
    fs.writeFileSync(
      reportPath,
      JSON.stringify(reportData, null, 2) + "\n",
      "utf8",
    );
  }

  writeOutputs({
    status,
    ref,
    branch,
    sha,
    workflows_changed: workflowsChanged ? "true" : "false",
  });

  const report = renderReport(reportData);
  writeSummary(report);

  return reportData;
}

// Workflows the fork runs. Every other upstream workflow stays disabled; GitHub only
// registers a workflow (and lets us disable it) after its first event.
const FORK_WORKFLOWS = new Set([
  ".github/workflows/ci.yml",
  ".github/workflows/intelia-release.yml",
  ".github/workflows/intelia-upstream-sync.yml",
  ".github/workflows/intelia-candidate.yml",
]);

export function workflowsToDisable(workflows) {
  return workflows.filter(
    (w) =>
      w.state === "active" &&
      !FORK_WORKFLOWS.has(w.path) &&
      // dynamic/* are GitHub-managed (CodeQL default setup, Dependabot), not upstream files.
      !w.path.startsWith("dynamic/"),
  );
}

export function disableWorkflows() {
  const repo = process.env.GITHUB_REPOSITORY;
  const pages = JSON.parse(
    execFileSync(
      "gh",
      ["api", "--paginate", "--slurp", `repos/${repo}/actions/workflows?per_page=100`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  const targets = workflowsToDisable(pages.flatMap((page) => page.workflows));
  for (const w of targets) {
    execFileSync("gh", ["api", "-X", "PUT", `repos/${repo}/actions/workflows/${w.id}/disable`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  const report = targets.length
    ? `## Workflows de upstream desactivados\n\n${targets.map((w) => `- \`${w.path}\``).join("\n")}\n`
    : "## Workflows de upstream desactivados\n\nNinguno: no había ninguno activo fuera de los del fork.\n";
  writeSummary(report);
}

async function main() {
  const subcommand = process.argv[2];
  if (subcommand === "prepare") {
    const parsed = parsePrepareArgs(process.argv.slice(3));
    await prepare(parsed);
  } else if (subcommand === "disable-workflows") {
    disableWorkflows();
  } else {
    console.error(
      "Usage: node scripts/ci/intelia-upstream-sync.mjs <prepare|disable-workflows> [options] [ref]",
    );
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
