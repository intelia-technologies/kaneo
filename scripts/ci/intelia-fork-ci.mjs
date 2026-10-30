import fs from "node:fs";
import { pathToFileURL } from "node:url";

const PINNED_CHECKOUT =
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1";
const PINNED_BUILDX =
  "docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4";
const PINNED_BUILD_PUSH =
  "docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc # v7";

function skipStepBody(lines, startIndex, indent) {
  let i = startIndex;
  while (i < lines.length) {
    const next = lines[i];
    if (next.trim().length === 0) break;
    const nextIndent = next.match(/^(\s*)/)[1];
    if (
      nextIndent.length > indent.length &&
      !next.trimStart().startsWith("- ")
    ) {
      i++;
    } else {
      break;
    }
  }
  return i;
}

// A step body (the lines after its `- ` line) matches only if every line, trimmed, matches
// the expected patterns in order. Anything else is left untouched for checkForkCi to flag.
function stepBody(lines, start, indent) {
  const end = skipStepBody(lines, start, indent);
  return { end, body: lines.slice(start, end).map((l) => l.trim()) };
}

function bodyIs(body, patterns) {
  return (
    body.length === patterns.length && body.every((l, k) => patterns[k].test(l))
  );
}

const BUILDER_BODY = [
  /^uses:\s+useblacksmith\/setup-docker-builder@\S+(\s+#.*)?$/,
  /^with:$/,
  /^cache-key:\s+\S.*$/,
];
const BUILDER_USES_BODY = [/^with:$/, /^cache-key:\s+\S.*$/];
const UPSTREAM_UPGRADE_BODY = [
  /^env:$/,
  /^GH_TOKEN:\s+\$\{\{\s*github\.token\s*\}\}$/,
  /^run:\s+bash scripts\/ci\/upgrade\.sh$/,
];

/**
 * Adapts upstream's ci.yml to GitHub-hosted runners. Only rewrites what it recognises with
 * certainty (Blacksmith runners and actions, and upstream's untouched upgrade step); every
 * other line, including our own customisations, is kept byte for byte.
 */
export function forkCi(text) {
  const lines = text.split("\n");
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Rule 1: runs-on: blacksmith-... -> ubuntu-24.04
    const runsOnMatch = line.match(/^(\s*runs-on:\s*)blacksmith-\S+(.*)$/);
    if (runsOnMatch) {
      result.push(`${runsOnMatch[1]}ubuntu-24.04${runsOnMatch[2]}`);
      i++;
      continue;
    }

    // Rule 2: useblacksmith/checkout -> actions/checkout pinned
    const checkoutMatch = line.match(
      /^(\s*-?\s*uses:\s*)useblacksmith\/checkout@\S+.*$/,
    );
    if (checkoutMatch) {
      result.push(`${checkoutMatch[1]}${PINNED_CHECKOUT}`);
      i++;
      continue;
    }

    // Rule 3: Setup Blacksmith Builder step (with only its cache-key) -> Set up Docker Buildx
    const builderMatch = line.match(
      /^(\s*)-\s+name:\s+Set(?:up|\s+up)\s+Blacksmith\s+Builder\s*$/,
    );
    if (builderMatch) {
      const indent = builderMatch[1];
      const { end, body } = stepBody(lines, i + 1, indent);
      if (bodyIs(body, BUILDER_BODY)) {
        result.push(`${indent}- name: Set up Docker Buildx`);
        result.push(`${indent}  uses: ${PINNED_BUILDX}`);
        i = end;
        continue;
      }
    }

    // Rule 3b: the same builder step written as `- uses: useblacksmith/setup-docker-builder`
    const builderUsesMatch = line.match(
      /^(\s*)-\s+uses:\s+useblacksmith\/setup-docker-builder@\S+.*$/,
    );
    if (builderUsesMatch) {
      const indent = builderUsesMatch[1];
      const { end, body } = stepBody(lines, i + 1, indent);
      if (bodyIs(body, BUILDER_USES_BODY)) {
        result.push(`${indent}- name: Set up Docker Buildx`);
        result.push(`${indent}  uses: ${PINNED_BUILDX}`);
        i = end;
        continue;
      }
    }

    // Rule 4: useblacksmith/build-push-action -> docker/build-push-action pinned
    const buildPushMatch = line.match(
      /^(\s*-?\s*uses:\s*)useblacksmith\/build-push-action@\S+.*$/,
    );
    if (buildPushMatch) {
      result.push(`${buildPushMatch[1]}${PINNED_BUILD_PUSH}`);
      i++;
      continue;
    }

    // Rule 5: upstream's upgrade step, exactly as upstream writes it -> fork version with
    // KANEO_UPGRADE_REPOSITORY and KANEO_UPGRADE_TAG. An already adapted step (ours, maybe
    // with our own additions) or a changed upstream body is left untouched.
    const upgradeMatch = line.match(
      /^(\s*)-\s+name:\s+Upgrade from the latest stable release\s*$/,
    );
    if (upgradeMatch) {
      const indent = upgradeMatch[1];
      const { end, body } = stepBody(lines, i + 1, indent);
      if (bodyIs(body, UPSTREAM_UPGRADE_BODY)) {
        result.push(
          `${indent}- name: Upgrade from the upstream release this fork is built on`,
        );
        result.push(`${indent}  env:`);
        result.push(`${indent}    GH_TOKEN: \${{ github.token }}`);
        result.push(
          `${indent}    # Intelia fork: the baseline is upstream's vX.Y.Z from package.json (README-INTELIA.md).`,
        );
        result.push(`${indent}    KANEO_UPGRADE_REPOSITORY: usekaneo/kaneo`);
        result.push(
          `${indent}  run: KANEO_UPGRADE_TAG="v$(node -p 'require("./package.json").version')" bash scripts/ci/upgrade.sh`,
        );
        i = end;
        continue;
      }
    }

    result.push(line);
    i++;
  }

  return result.join("\n");
}

export function checkForkCi(text) {
  const problems = [];
  const lines = text.split("\n");
  lines.forEach((line, idx) => {
    const codePart = line.replace(/^\s*#.*$/, "").replace(/\s+#.*$/, "");
    if (/blacksmith/i.test(codePart)) {
      problems.push(
        `Line ${idx + 1}: contains residual blacksmith reference: "${line.trim()}"`,
      );
    }
  });

  if (!text.includes("KANEO_UPGRADE_REPOSITORY: usekaneo/kaneo")) {
    problems.push(
      "Upgrade step is missing 'KANEO_UPGRADE_REPOSITORY: usekaneo/kaneo'",
    );
  }
  if (!text.includes("KANEO_UPGRADE_TAG=")) {
    problems.push("Upgrade step is missing 'KANEO_UPGRADE_TAG' definition");
  }
  if (/Upgrade from the latest stable release/.test(text)) {
    problems.push(
      "Upgrade step still has upstream title 'Upgrade from the latest stable release'",
    );
  }

  return problems;
}

export function assertForkCi(text) {
  const problems = checkForkCi(text);
  if (problems.length > 0) {
    throw new Error(
      `Residual fork CI problems detected:\n  - ${problems.join("\n  - ")}`,
    );
  }
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/ci/intelia-fork-ci.mjs <file>");
    process.exit(1);
  }

  const content = fs.readFileSync(file, "utf8");
  const transformed = forkCi(content);
  fs.writeFileSync(file, transformed, "utf8");

  const problems = checkForkCi(transformed);
  if (problems.length > 0) {
    console.error(`Residual problems found in ${file}:`);
    for (const p of problems) {
      console.error(`  - ${p}`);
    }
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
