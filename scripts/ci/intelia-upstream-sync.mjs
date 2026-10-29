import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { assertForkCi, forkCi } from "./intelia-fork-ci.mjs";

const STATE_FILE = ".git/intelia-upstream-sync-state.json";
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

export function renderPrBody({
  ref,
  repo,
  headSha,
  autoResolvedFiles = [],
  addedWorkflows = [],
  drizzleChanged = false,
}) {
  const isTag = /^v\d+\.\d+\.\d+$/.test(ref);
  const repoOwner = repo ? repo.split("/")[0] : "intelia-technologies";
  const headSha12 = headSha ? headSha.slice(0, 12) : "unknown";
  const candidateImage = `ghcr.io/${repoOwner}/kaneo:candidate-${headSha12}`;

  const upstreamLink = isTag
    ? `https://github.com/usekaneo/kaneo/releases/tag/${ref}`
    : `https://github.com/usekaneo/kaneo/tree/${ref} (ensayo / rehearsal)`;

  const resolvedSection =
    autoResolvedFiles.length > 0
      ? autoResolvedFiles
          .map((f) => `- \`${f}\` (adaptado a GitHub Actions con \`forkCi\`)`)
          .join("\n")
      : "Ninguno (merge limpio).";

  const workflowsSection =
    addedWorkflows.length > 0
      ? addedWorkflows
          .map((w) => `- \`${w}\`: desactivar tras el merge con \`gh workflow disable\``)
          .join("\n")
      : "Ninguno.";

  const drizzleSection = drizzleChanged
    ? "Upstream ha modificado `apps/api/drizzle/`. Recordatorio: el fork nunca añade ficheros en este directorio (las migraciones propias van en el esquema `intelia`). Verificar que no haya colisiones de número o diario."
    : "Sin cambios en `apps/api/drizzle/`.";

  return `## Puesta al día con upstream ${ref}

- **Upstream:** ${upstreamLink}
- **Imagen candidata:** \`${candidateImage}\`

### Ficheros autoresueltos
${resolvedSection}

### Nuevos workflows de upstream
${workflowsSection}

### Base de datos (Drizzle)
${drizzleSection}

### Checklist de adopción (ver [README-INTELIA.md](README-INTELIA.md))
- [ ] CI de la PR en verde (incluidos smoke tests).
- [ ] Tests live de la factory en verde contra la imagen candidata (\`${candidateImage}\`).
- [ ] Revisar \`git diff ${ref} main\` para confirmar que los cambios propios siguen intactos.
- [ ] Desactivar los nuevos workflows de upstream tras el merge con \`gh workflow disable\`.
- [ ] Drizzle: confirmar que no hay ficheros propios en \`apps/api/drizzle/\`.
- [ ] Merge de la PR con merge commit (nunca squash ni rebase).
- [ ] Etiquetar versión \`${ref}-intelia.1\` en \`main\` tras el merge.
- [ ] Despliegue gestionado desde la factory.
`;
}

export function renderReport({
  status,
  ref,
  branch,
  autoResolvedFiles = [],
  addedWorkflows = [],
  drizzleChanged = false,
  conflictedFiles = [],
}) {
  let md = `## Sincronización con upstream: ${ref}\n\n`;
  md += `- **Estado:** \`${status}\`\n`;
  md += `- **Rama:** \`${branch}\`\n\n`;

  if (status === "ready") {
    md += `### Resumen del merge\n`;
    md += `- **Ficheros autoresueltos:** ${
      autoResolvedFiles.length > 0
        ? autoResolvedFiles.map((f) => `\`${f}\``).join(", ")
        : "Ninguno"
    }\n`;
    md += `- **Nuevos workflows de upstream:** ${
      addedWorkflows.length > 0
        ? addedWorkflows.map((w) => `\`${w}\``).join(", ")
        : "Ninguno"
    }\n`;
    md += `- **Cambios en Drizzle:** ${drizzleChanged ? "Sí (verificar en PR)" : "No"}\n`;
  } else if (status === "uptodate") {
    md += `La referencia de upstream \`${ref}\` ya es ancestro de HEAD. No se requiere sincronización.\n`;
  } else if (status === "open") {
    md += `Ya existe la rama \`${branch}\` en el fork (con o sin pull request). No se sobreescribe el trabajo humano: abre la PR desde esa rama o bórrala para regenerarla.\n`;
  } else if (status === "conflicts") {
    md += `### Conflictos no resolubles automáticamente\n`;
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

export async function prepare(explicitRefArg) {
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
    writeOutputs({ status, ref, branch });
    const report = renderReport({ status, ref, branch });
    writeSummary(report);
    return { status, ref, branch };
  }

  // Never clobber an existing sync branch (open PR or manual conflict resolution in progress).
  const repo = process.env.GITHUB_REPOSITORY;
  if (repo) {
    const prs = JSON.parse(
      execFileSync(
        "gh",
        ["pr", "list", "--repo", repo, "--head", branch, "--state", "open", "--json", "number"],
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
      writeOutputs({ status, ref, branch });
      writeSummary(renderReport({ status, ref, branch }));
      return { status, ref, branch };
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
      writeOutputs({ status, ref, branch });
      for (const f of unmerged) {
        console.error(`::error file=${f}::Merge conflict in ${f}`);
      }
      const report = renderReport({
        status,
        ref,
        branch,
        conflictedFiles: unmerged,
      });
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

  // Collect merge details
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
  const status = "ready";

  // Persist state in git checkout for publish step
  const stateData = {
    ref,
    branch,
    autoResolvedFiles,
    addedWorkflows,
    drizzleChanged,
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(stateData, null, 2), "utf8");

  writeOutputs({ status, ref, branch });
  const report = renderReport({
    status,
    ref,
    branch,
    autoResolvedFiles,
    addedWorkflows,
    drizzleChanged,
  });
  writeSummary(report);

  return {
    status,
    ref,
    branch,
    autoResolvedFiles,
    addedWorkflows,
    drizzleChanged,
  };
}

export async function publish() {
  const token = process.env.GH_TOKEN;
  if (!token) {
    throw new Error("GH_TOKEN is required for publish");
  }

  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error(
      `Valid GITHUB_REPOSITORY (owner/repo) is required for publish, got "${repo}"`,
    );
  }

  const branch = execGit(["branch", "--show-current"]).trim();
  if (!branch.startsWith("intelia/upstream-")) {
    throw new Error(
      `Expected current branch to start with 'intelia/upstream-', got '${branch}'`,
    );
  }
  const ref = branch.replace(/^intelia\/upstream-/, "");

  const headSha = execGit(["rev-parse", "HEAD"]).trim();

  // prepare leaves its state in .git of the same checkout; publish never runs without it.
  const { autoResolvedFiles, addedWorkflows, drizzleChanged } = JSON.parse(
    fs.readFileSync(STATE_FILE, "utf8"),
  );

  // Push branch without echoing the token
  const pushUrl = `https://x-access-token:${token}@github.com/${repo}.git`;
  try {
    execFileSync("git", ["push", pushUrl, `HEAD:refs/heads/${branch}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const sanitizedMsg = (err.message || "").replaceAll(token, "***");
    const sanitizedStderr = (err.stderr ? err.stderr.toString() : "").replaceAll(
      token,
      "***",
    );
    throw new Error(
      `Git push failed without exposing credentials: ${sanitizedMsg}\n${sanitizedStderr}`,
    );
  }

  // Create PR
  const title = `chore: merge upstream ${ref}`;
  const body = renderPrBody({
    ref,
    repo,
    headSha,
    autoResolvedFiles,
    addedWorkflows,
    drizzleChanged,
  });

  const prOutput = execFileSync(
    "gh",
    [
      "pr",
      "create",
      "--repo",
      repo,
      "--base",
      "main",
      "--head",
      branch,
      "--title",
      title,
      "--body",
      body,
    ],
    {
      env: { ...process.env, GH_TOKEN: token },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  console.log(`Created PR: ${prOutput.trim()}`);
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
    const explicitRef = process.argv[3] || process.env.UPSTREAM_REF;
    await prepare(explicitRef);
  } else if (subcommand === "publish") {
    await publish();
  } else if (subcommand === "disable-workflows") {
    disableWorkflows();
  } else {
    console.error(
      "Usage: node scripts/ci/intelia-upstream-sync.mjs <prepare|publish|disable-workflows> [ref]",
    );
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
