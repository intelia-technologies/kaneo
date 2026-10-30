import assert from "node:assert/strict";
import test from "node:test";
import { assertForkCi, checkForkCi, forkCi } from "./intelia-fork-ci.mjs";

test("Rule 1: blacksmith runs-on is replaced with ubuntu-24.04 preserving indent", () => {
  const input = `
jobs:
  test:
    runs-on: blacksmith-4vcpu-ubuntu-2404
    steps:
      - run: echo ok
`.trim();

  const expected = `
jobs:
  test:
    runs-on: ubuntu-24.04
    steps:
      - run: echo ok
`.trim();

  assert.equal(forkCi(input), expected);
});

test("Rule 2: useblacksmith/checkout is replaced with pinned actions/checkout", () => {
  const input = `
    steps:
      - uses: useblacksmith/checkout@25227e61ff9dafe400e22fa487b673eac4e4409a # v1
        with:
          persist-credentials: false
      - name: Checkout repository
        uses: useblacksmith/checkout@25227e61ff9dafe400e22fa487b673eac4e4409a # v1
`.trim();

  const expected = `
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - name: Checkout repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
`.trim();

  assert.equal(forkCi(input), expected);
});

test("Rule 3: Setup Blacksmith Builder step is replaced with Set up Docker Buildx", () => {
  const input = `
    steps:
      - name: Setup Blacksmith Builder
        uses: useblacksmith/setup-docker-builder@19215110ab936351210feebdfa5b440b4493e184 # v2.2.0
        with:
          cache-key: \${{ github.repository }}/kaneo
      - name: Build this revision of Kaneo
`.trim();

  const expected = `
    steps:
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4
      - name: Build this revision of Kaneo
`.trim();

  assert.equal(forkCi(input), expected);
});

test("Rule 4: useblacksmith/build-push-action is replaced with pinned docker/build-push-action", () => {
  const input = `
    steps:
      - name: Build this revision of Kaneo
        uses: useblacksmith/build-push-action@9b0579bbec7a6cad2f171596c57e7ac1e7658850 # v2
        with:
          context: .
`.trim();

  const expected = `
    steps:
      - name: Build this revision of Kaneo
        uses: docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc # v7
        with:
          context: .
`.trim();

  assert.equal(forkCi(input), expected);
});

test("Rule 5: upgrade step is adapted with KANEO_UPGRADE_REPOSITORY and KANEO_UPGRADE_TAG", () => {
  const input = `
    steps:
      - name: Upgrade from the latest stable release
        env:
          GH_TOKEN: \${{ github.token }}
        run: bash scripts/ci/upgrade.sh
      - name: Save container logs
`.trim();

  const expected = `
    steps:
      - name: Upgrade from the upstream release this fork is built on
        env:
          GH_TOKEN: \${{ github.token }}
          # Intelia fork: the baseline is upstream's vX.Y.Z from package.json (README-INTELIA.md).
          KANEO_UPGRADE_REPOSITORY: usekaneo/kaneo
        run: KANEO_UPGRADE_TAG="v$(node -p 'require("./package.json").version')" bash scripts/ci/upgrade.sh
      - name: Save container logs
`.trim();

  assert.equal(forkCi(input), expected);
});

test("Idempotence: running forkCi multiple times gives the same result", () => {
  const fullFixture = `
jobs:
  docker-build:
    runs-on: blacksmith-4vcpu-ubuntu-2404
    steps:
      - uses: useblacksmith/checkout@25227e61ff9dafe400e22fa487b673eac4e4409a # v1
      - name: Setup Blacksmith Builder
        uses: useblacksmith/setup-docker-builder@19215110ab936351210feebdfa5b440b4493e184 # v2.2.0
        with:
          cache-key: \${{ github.repository }}/kaneo
      - name: Build bundled image
        uses: useblacksmith/build-push-action@9b0579bbec7a6cad2f171596c57e7ac1e7658850 # v2
      - name: Upgrade from the latest stable release
        env:
          GH_TOKEN: \${{ github.token }}
        run: bash scripts/ci/upgrade.sh
`.trim();

  const once = forkCi(fullFixture);
  const twice = forkCi(once);
  const thrice = forkCi(twice);

  assert.equal(twice, once);
  assert.equal(thrice, once);
  assertForkCi(once);
});

test("Residual problem detection flags residual blacksmith in active lines", () => {
  const withBlacksmith = `
jobs:
  test:
    runs-on: blacksmith-4vcpu-ubuntu-2404
    steps:
      - run: echo ok
      - name: Upgrade from the upstream release this fork is built on
        env:
          GH_TOKEN: \${{ github.token }}
          # Intelia fork: the baseline is upstream's vX.Y.Z from package.json (README-INTELIA.md).
          KANEO_UPGRADE_REPOSITORY: usekaneo/kaneo
        run: KANEO_UPGRADE_TAG="v$(node -p 'require("./package.json").version')" bash scripts/ci/upgrade.sh
`.trim();

  const problems = checkForkCi(withBlacksmith);
  assert.ok(problems.length > 0);
  assert.match(problems[0], /residual blacksmith/);
  assert.throws(
    () => assertForkCi(withBlacksmith),
    /Residual fork CI problems detected/,
  );
});

test("Residual problem detection flags unadapted upgrade step", () => {
  const missingUpgradeConfig = `
jobs:
  test:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - name: Upgrade from the latest stable release
        run: bash scripts/ci/upgrade.sh
`.trim();

  const problems = checkForkCi(missingUpgradeConfig);
  assert.ok(problems.length >= 2);
  assert.ok(problems.some((p) => p.includes("KANEO_UPGRADE_REPOSITORY")));
  assert.ok(
    problems.some((p) => p.includes("Upgrade from the latest stable release")),
  );
  assert.throws(() => assertForkCi(missingUpgradeConfig));
});
