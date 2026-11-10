// Intelia fork (README-INTELIA.md, «Versión»): decisions of intelia-release.yml.
// The commit status `intelia-release` on main's tip records the outcome, so each
// commit is tested once: a green or red one is never retried, a pending one (a run
// that was cancelled before reporting) is.
//
// Usage (GITHUB_REPOSITORY and GH_TOKEN set):
//   intelia-release.mjs decide <sha> <publish>   writes run=true|false to GITHUB_OUTPUT
//   intelia-release.mjs tag <sha>                writes tag= and version= to GITHUB_OUTPUT
//   intelia-release.mjs push-tag <sha> <tag>
//   intelia-release.mjs report <sha> <tag> <job result>...   success or failure status
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const CONTEXT = "intelia-release";
const SHA = /^[a-f0-9]{40}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** True when the commit still needs a release run: no final `intelia-release` status yet. */
export function needsRelease(combinedStatus) {
  const status = combinedStatus.statuses?.find((s) => s.context === CONTEXT);
  return !["success", "failure"].includes(status?.state);
}

/** `v<version>-intelia.<N+1>`, N being the highest existing for that version (0 if none). */
export function nextTag(version, refs) {
  if (!VERSION.test(version))
    throw new Error(`package.json version must be X.Y.Z, got ${version}`);
  const prefix = `refs/tags/v${version}-intelia.`;
  let highest = 0;
  for (const ref of refs) {
    if (!ref.startsWith(prefix)) continue;
    const n = ref.slice(prefix.length);
    if (/^[1-9]\d*$/.test(n)) highest = Math.max(highest, Number(n));
  }
  return `v${version}-intelia.${highest + 1}`;
}

/**
 * The vX.Y.Z-intelia.N tag already on the commit, from `git ls-remote --tags` lines
 * (annotated tags appear peeled as `<commit>\trefs/tags/<tag>^{}`), or null. A commit
 * tagged by hand or by a run whose report failed is already released.
 */
export function releasedTag(lsRemote, sha) {
  const tags = lsRemote
    .split("\n")
    .map((line) => line.split("\t"))
    .filter(([object]) => object === sha)
    .map(([, ref]) => ref?.replace(/^refs\/tags\//, "").replace(/\^\{\}$/, ""))
    .filter((tag) => /^v\d+\.\d+\.\d+-intelia\.[1-9]\d*$/.test(tag ?? ""));
  return (
    tags.sort((a, b) => a.localeCompare(b, "en", { numeric: true })).at(-1) ??
    null
  );
}

/**
 * Final state from the needed jobs' results. The report only runs when the run was not
 * cancelled, so a cancelled job here timed out (or lost its queue slot): red too.
 */
export function outcome(results) {
  if (results.some((r) => r === "failure" || r === "cancelled"))
    return "failure";
  if (results.length > 0 && results.every((r) => r === "success"))
    return "success";
  return null;
}

function gh(args) {
  return execFileSync("gh", ["api", ...args], {
    encoding: "utf8",
    timeout: 30_000,
  });
}

function output(values) {
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}\n`);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, lines.join(""));
  process.stdout.write(lines.join(""));
}

function runUrl() {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}

function setStatus(repo, sha, state, description) {
  gh([
    "-X",
    "POST",
    `repos/${repo}/statuses/${sha}`,
    "-f",
    `state=${state}`,
    "-f",
    `context=${CONTEXT}`,
    "-f",
    `target_url=${runUrl()}`,
    "-f",
    `description=${description.slice(0, 140)}`,
  ]);
}

async function main([command, sha, ...rest]) {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "") || !SHA.test(sha ?? ""))
    throw new Error("Expected GITHUB_REPOSITORY and a full commit SHA");

  if (command === "decide") {
    const publish = rest[0] === "true";
    // A dry run (publicar = no) always tests and never touches the status.
    if (!publish) return output({ run: true });
    const combined = JSON.parse(
      gh([`repos/${repo}/commits/${sha}/status?per_page=100`]),
    );
    if (!needsRelease(combined)) {
      console.log(
        `${sha} already has a final ${CONTEXT} status; nothing to do`,
      );
      return output({ run: false });
    }
    const tag = releasedTag(
      execFileSync(
        "git",
        ["ls-remote", "--tags", "origin", "refs/tags/v*-intelia.*"],
        { encoding: "utf8", timeout: 30_000 },
      ),
      sha,
    );
    if (tag) {
      console.log(`${sha} is already released as ${tag}; marking it`);
      setStatus(repo, sha, "success", `Publicada ${tag}`);
      return output({ run: false });
    }
    setStatus(repo, sha, "pending", "Probando CI e integración");
    return output({ run: true });
  }

  if (command === "tag") {
    const version = JSON.parse(readFileSync("package.json", "utf8")).version;
    const refs = gh([
      "--paginate",
      `repos/${repo}/git/matching-refs/tags/v${version}-intelia.`,
      "--jq",
      ".[].ref",
    ])
      .split("\n")
      .filter(Boolean);
    const tag = nextTag(version, refs);
    return output({ tag, version: tag.slice(1) });
  }

  if (command === "push-tag") {
    // Annotated, like the manual tags before; creating an existing ref fails (422).
    const [tag] = rest;
    if (!/^v\d+\.\d+\.\d+-intelia\.[1-9]\d*$/.test(tag ?? ""))
      throw new Error(`Unexpected tag ${tag}`);
    const object = JSON.parse(
      gh([
        "-X",
        "POST",
        `repos/${repo}/git/tags`,
        "-f",
        `tag=${tag}`,
        "-f",
        `message=${tag}`,
        "-f",
        `object=${sha}`,
        "-f",
        "type=commit",
      ]),
    ).sha;
    gh([
      "-X",
      "POST",
      `repos/${repo}/git/refs`,
      "-f",
      `ref=refs/tags/${tag}`,
      "-f",
      `sha=${object}`,
    ]);
    return console.log(`Tagged ${sha} as ${tag}`);
  }

  if (command === "report") {
    // report <sha> <tag> <job result>...: success needs every job green.
    const [tag, ...results] = rest;
    const state = outcome(results);
    if (!state) {
      console.log(`Results ${results.join(", ")}: ${sha} stays pending`);
      return;
    }
    return setStatus(
      repo,
      sha,
      state,
      state === "success"
        ? `Publicada ${tag}`
        : "En rojo (CI, integración o publicación); ver la ejecución",
    );
  }

  throw new Error(`Unknown command ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main(process.argv.slice(2));
