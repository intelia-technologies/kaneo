import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { checkForkCi, forkCi } from "./intelia-fork-ci.mjs";

const UPSTREAM_REPO_URL = "https://github.com/usekaneo/kaneo.git";
const CI_YML = ".github/workflows/ci.yml";
const FORK_REPOSITORY =
  process.env.KANEO_FORK_REPOSITORY || "intelia-technologies/kaneo";

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

  if (
    !explicitRef &&
    process.env.UPSTREAM_REF &&
    process.env.UPSTREAM_REF.trim()
  ) {
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
  activeOutsideAllowlist = [],
  pullRequestTargetWorkflows = [],
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
    activeOutsideAllowlist,
    pullRequestTargetWorkflows,
  };
}

/**
 * Resolves a conflict in ci.yml only when it is the known one: the fork's ci.yml must be
 * exactly forkCi(upstream base), i.e. carry no change of ours besides the runner adaptation.
 * Then the right merge is upstream's new file with the same adaptation. Otherwise (an
 * adaptation of ours would be lost, or forkCi cannot adapt the new file) returns null.
 */
export function resolveForkCi({ base, ours, theirs }) {
  if (base == null || ours == null || theirs == null) return null;
  if (ours !== forkCi(base)) return null;
  const resolved = forkCi(theirs);
  return checkForkCi(resolved).length === 0 ? resolved : null;
}

function renderWorkflowWarnings({
  activeOutsideAllowlist = [],
  pullRequestTargetWorkflows = [],
}) {
  let md = "";
  if (activeOutsideAllowlist.length > 0) {
    md += `\n### Workflows activos fuera de la lista blanca\n`;
    md += activeOutsideAllowlist.map((w) => `- \`${w}\``).join("\n") + "\n";
  }
  if (pullRequestTargetWorkflows.length > 0) {
    md += `\n### Workflows con \`pull_request_target\`\n`;
    md += pullRequestTargetWorkflows.map((w) => `- \`${w}\``).join("\n") + "\n";
  }
  return md;
}

export function renderReport(data) {
  const {
    status,
    ref,
    branch,
    sha = "",
    changedFiles = [],
    autoResolvedFiles = [],
    addedWorkflows = [],
    drizzleChanged = false,
    conflictedFiles = [],
  } = data;
  let md = `## Sincronización con upstream: ${ref}\n\n`;
  md += `- **Estado:** \`${status}\`\n`;
  md += `- **Rama:** \`${branch}\`\n`;

  if (status === "ready") {
    if (sha) md += `- **Commit:** \`${sha}\`\n`;
    md += `- **Ficheros modificados:** ${changedFiles.length}\n`;
    if (changedFiles.length > 0) {
      md += `\n<details>\n<summary>Lista completa de ficheros modificados (${changedFiles.length})</summary>\n\n`;
      md += changedFiles.map((f) => `- \`${f}\``).join("\n") + "\n";
      md += `</details>\n\n`;
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
    md += `Se ha abortado el merge (y borrado la rama local) por conflictos en:\n`;
    md += conflictedFiles.map((f) => `- \`${f}\``).join("\n") + "\n";
  }

  return md + renderWorkflowWarnings(data);
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

function gitLines(args) {
  return execGit(args).trim().split("\n").filter(Boolean);
}

function showFile(rev, path) {
  try {
    return execGit(["show", `${rev}:${path}`]);
  } catch {
    return null;
  }
}

// Workflows the fork runs: ours (`intelia-*`), upstream's CI adapted to GitHub runners and
// GitHub's default CodeQL setup. Every other workflow (upstream's today and any it adds
// later) must stay disabled; GitHub only registers a workflow, and lets us disable it,
// after its first event, so the weekly job keeps enforcing this.
export function isAllowedWorkflow(path) {
  return (
    path === CI_YML ||
    /^\.github\/workflows\/intelia-[\w.-]+\.ya?ml$/.test(path) ||
    path === "dynamic/github-code-scanning/codeql"
  );
}

export function workflowsToDisable(workflows) {
  return workflows.filter(
    (w) => w.state === "active" && !isAllowedWorkflow(w.path),
  );
}

export function usesPullRequestTarget(text) {
  return text
    .split("\n")
    .some(
      (line) => !/^\s*#/.test(line) && /\bpull_request_target\b/.test(line),
    );
}

function listWorkflows(repo) {
  const pages = JSON.parse(
    execFileSync(
      "gh",
      [
        "api",
        "--paginate",
        "--slurp",
        `repos/${repo}/actions/workflows?per_page=100`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  return pages.flatMap((page) => page.workflows);
}

function pullRequestTargetFiles() {
  return gitLines(["ls-files", ".github/workflows"]).filter(
    (f) =>
      /\.ya?ml$/.test(f) && usesPullRequestTarget(fs.readFileSync(f, "utf8")),
  );
}

function workflowWarnings() {
  const activeOutsideAllowlist = workflowsToDisable(
    listWorkflows(FORK_REPOSITORY),
  ).map((w) => w.path);
  const pullRequestTargetWorkflows = pullRequestTargetFiles();
  for (const w of activeOutsideAllowlist) {
    console.error(
      `::warning file=${w}::Workflow activo fuera de la lista blanca del fork`,
    );
  }
  for (const w of pullRequestTargetWorkflows) {
    console.error(`::warning file=${w}::Workflow con pull_request_target`);
  }
  return { activeOutsideAllowlist, pullRequestTargetWorkflows };
}

function finish(reportPath, data) {
  const reportData = buildReportData({ ...data, ...workflowWarnings() });
  if (reportPath) {
    fs.writeFileSync(
      reportPath,
      JSON.stringify(reportData, null, 2) + "\n",
      "utf8",
    );
  }
  writeOutputs({
    status: reportData.status,
    ref: reportData.ref,
    branch: reportData.branch,
    sha: reportData.sha,
    workflows_changed: reportData.workflowsChanged ? "true" : "false",
  });
  writeSummary(renderReport(reportData));
  return reportData;
}

function fetchUpstream(ref) {
  try {
    const refspec = ref.startsWith("v")
      ? `+refs/tags/${ref}:refs/tags/${ref}`
      : `+refs/heads/${ref}:refs/remotes/upstream/${ref}`;
    execGit(["fetch", "--no-tags", UPSTREAM_REPO_URL, refspec]);
  } catch {
    // Not a tag or branch name (e.g. a commit SHA): fetch it into FETCH_HEAD.
    execGit(["fetch", "--no-tags", UPSTREAM_REPO_URL, ref]);
  }
  return execGit(["rev-parse", "FETCH_HEAD^{commit}"]).trim();
}

function syncBranchExists(branch) {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return false;
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
  return prs.length > 0 || remoteBranch !== "";
}

export async function prepare(opts = {}) {
  const { explicitRef = null, noBranchCheck = false, reportPath = null } = opts;

  const ref = explicitRef
    ? validateRef(explicitRef, true)
    : validateRef(
        execFileSync(
          "gh",
          ["api", "repos/usekaneo/kaneo/releases/latest", "--jq", ".tag_name"],
          {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          },
        ).trim(),
        false,
      );
  const branch = getBranchName(ref);
  const targetCommit = fetchUpstream(ref);

  let merged = true;
  try {
    execGit(["merge-base", "--is-ancestor", targetCommit, "HEAD"]);
  } catch {
    merged = false;
  }
  if (merged) return finish(reportPath, { status: "uptodate", ref, branch });

  // Never clobber an existing sync branch (open PR or manual conflict resolution in progress).
  if (!noBranchCheck && syncBranchExists(branch)) {
    return finish(reportPath, { status: "open", ref, branch });
  }

  const currentBranch = execGit(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  const startRef =
    currentBranch === "HEAD"
      ? execGit(["rev-parse", "HEAD"]).trim()
      : currentBranch;
  const mergeBase = execGit(["merge-base", "HEAD", targetCommit]).trim();

  // `checkout -b` refuses to reuse an existing local branch.
  execGit(["checkout", "-b", branch, "HEAD"]);
  const identity = getGitIdentityArgs();
  let mergeError;
  try {
    execGit([...identity, "merge", "--no-ff", "--no-commit", targetCommit]);
  } catch (err) {
    mergeError = err;
  }

  const unmerged = gitLines(["diff", "--name-only", "--diff-filter=U"]);
  // A merge that stops without unmerged paths failed for another reason: surface it.
  if (mergeError && unmerged.length === 0) throw mergeError;

  const autoResolvedFiles = [];
  let conflictedFiles = unmerged.filter((f) => f !== CI_YML);
  if (unmerged.includes(CI_YML)) {
    const resolved = resolveForkCi({
      base: showFile(mergeBase, CI_YML),
      ours: showFile("HEAD", CI_YML),
      theirs: showFile(targetCommit, CI_YML),
    });
    if (resolved === null) {
      conflictedFiles = unmerged;
    } else if (conflictedFiles.length === 0) {
      fs.writeFileSync(CI_YML, resolved, "utf8");
      execGit(["add", CI_YML]);
      autoResolvedFiles.push(CI_YML);
    }
  }

  if (conflictedFiles.length > 0) {
    // Leave the checkout as it was, so the manual procedure can start from scratch.
    execGit(["merge", "--abort"]);
    execGit(["checkout", startRef]);
    execGit(["branch", "-D", branch]);
    for (const f of unmerged) {
      console.error(`::error file=${f}::Merge conflict in ${f}`);
    }
    finish(reportPath, {
      status: "conflicts",
      ref,
      branch,
      conflictedFiles: unmerged,
    });
    process.exit(1);
  }

  // A clean merge can still bring new Blacksmith jobs: adapt them. forkCi only rewrites the
  // Blacksmith-specific lines, so nothing else in the merged file changes.
  if (fs.existsSync(CI_YML) && autoResolvedFiles.length === 0) {
    const merged = fs.readFileSync(CI_YML, "utf8");
    const adapted = forkCi(merged);
    const problems = checkForkCi(adapted);
    if (problems.length > 0)
      throw new Error(`ci.yml cannot be adapted: ${problems.join("; ")}`);
    if (adapted !== merged) {
      fs.writeFileSync(CI_YML, adapted, "utf8");
      execGit(["add", CI_YML]);
    }
  }

  execGit([...identity, "commit", "-m", `chore: merge upstream ${ref}`]);

  const changedFiles = gitLines(["diff", "--name-only", "HEAD^1", "HEAD"]);
  return finish(reportPath, {
    status: "ready",
    ref,
    branch,
    sha: execGit(["rev-parse", "HEAD"]).trim(),
    changedFiles,
    workflowsChanged: changedFiles.some((f) =>
      f.startsWith(".github/workflows/"),
    ),
    drizzleChanged: changedFiles.some((f) => f.startsWith("apps/api/drizzle/")),
    autoResolvedFiles,
    addedWorkflows: gitLines([
      "diff",
      "--name-only",
      "--diff-filter=A",
      "HEAD^1",
      "HEAD",
      "--",
      ".github/workflows",
    ]),
  });
}

export function disableWorkflows() {
  const repo = process.env.GITHUB_REPOSITORY;
  const targets = workflowsToDisable(listWorkflows(repo));
  for (const w of targets) {
    execFileSync(
      "gh",
      ["api", "-X", "PUT", `repos/${repo}/actions/workflows/${w.id}/disable`],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  }
  const stillActive = workflowsToDisable(listWorkflows(repo)).map(
    (w) => w.path,
  );
  const pullRequestTarget = pullRequestTargetFiles();

  let md = "## Workflows fuera de la lista blanca\n\n";
  md += targets.length
    ? `Desactivados ahora:\n${targets.map((w) => `- \`${w.path}\``).join("\n")}\n`
    : "No había ninguno activo.\n";
  if (pullRequestTarget.length > 0) {
    md += `\nCon \`pull_request_target\` en el repo (desactivados salvo que estén abajo):\n`;
    md += pullRequestTarget.map((w) => `- \`${w}\``).join("\n") + "\n";
  }
  if (stillActive.length > 0) {
    md += `\n**Siguen activos fuera de la lista blanca:**\n`;
    md += stillActive.map((w) => `- \`${w}\``).join("\n") + "\n";
  }
  writeSummary(md);
  if (stillActive.length > 0) {
    for (const w of stillActive) {
      console.error(`::error file=${w}::Sigue activo fuera de la lista blanca`);
    }
    process.exit(1);
  }
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
