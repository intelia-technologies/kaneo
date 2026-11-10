import assert from "node:assert/strict";
import test from "node:test";
import {
  MODES,
  needsRelease,
  nextTag,
  outcome,
  releasedTag,
} from "./intelia-release.mjs";

const status = (context, state) => ({ statuses: [{ context, state }] });

test("a rehearsal and a release are recorded apart: one never stops the other", () => {
  const ensayo = MODES.ensayo.context;
  assert.equal(ensayo, "intelia-release-ensayo");
  // A green rehearsal must not mark the commit as released...
  assert.equal(needsRelease(status(ensayo, "success")), true);
  // ...and a second rehearsal of the same commit respects its final status.
  assert.equal(needsRelease(status(ensayo, "success"), ensayo), false);
  assert.equal(needsRelease(status(ensayo, "failure"), ensayo), false);
  assert.equal(
    needsRelease(status("intelia-release", "success"), ensayo),
    true,
  );
});

test("a commit with a green or red intelia-release status is not tested again", () => {
  assert.equal(needsRelease(status("intelia-release", "success")), false);
  assert.equal(needsRelease(status("intelia-release", "failure")), false);
});

test("a commit without a final intelia-release status gets a release run", () => {
  assert.equal(needsRelease({ statuses: [] }), true);
  assert.equal(needsRelease({}), true);
  // A run cancelled after marking it pending is retried.
  assert.equal(needsRelease(status("intelia-release", "pending")), true);
  assert.equal(needsRelease(status("intelia-release", "error")), true);
  // Other contexts don't count, even if final.
  assert.equal(needsRelease(status("ci/other", "success")), true);
});

test("the tag continues the highest N of the package.json version", () => {
  assert.equal(
    nextTag("2.49.0", [
      "refs/tags/v2.49.0-intelia.2",
      "refs/tags/v2.49.0-intelia.10",
      "refs/tags/v2.49.0-intelia.9",
    ]),
    "v2.49.0-intelia.11",
  );
});

test("a new upstream version starts at intelia.1", () => {
  assert.equal(nextTag("2.50.0", []), "v2.50.0-intelia.1");
  assert.equal(
    nextTag("2.50.0", ["refs/tags/v2.49.0-intelia.7"]),
    "v2.50.0-intelia.1",
  );
});

test("tags of other versions or with a malformed N are ignored", () => {
  assert.equal(
    nextTag("2.49.0", [
      "refs/tags/v2.49.0-intelia.3",
      "refs/tags/v2.49.0-intelia.30-rc",
      "refs/tags/v2.49.0-intelia.07",
      "refs/tags/v2.49.0-intelia.",
      "refs/tags/v12.49.0-intelia.40",
      "refs/tags/v2.49.01-intelia.50",
    ]),
    "v2.49.0-intelia.4",
  );
});

test("a package.json version that is not X.Y.Z is rejected", () => {
  for (const version of ["2.49", "2.49.0-beta.1", "v2.49.0", "", undefined])
    assert.throws(() => nextTag(version, []), /X\.Y\.Z/);
});

test("the release is green only when every job passed", () => {
  assert.equal(outcome(["success", "success", "success"]), "success");
  // Red CI skips the publication: still red.
  assert.equal(outcome(["failure", "success", "skipped"]), "failure");
  assert.equal(outcome(["success", "success", "failure"]), "failure");
  assert.equal(outcome(["cancelled", "failure", "skipped"]), "failure");
});

test("a job that timed out (cancelled while the run goes on) makes it red", () => {
  assert.equal(outcome(["success", "cancelled", "skipped"]), "failure");
});

test("without a verdict for every job the commit stays pending", () => {
  assert.equal(outcome(["success", "success", "skipped"]), null);
  assert.equal(outcome([]), null);
});

const lsRemote = (sha) =>
  [
    `${"1".repeat(40)}\trefs/tags/v2.49.0-intelia.5`,
    `${sha}\trefs/tags/v2.49.0-intelia.5^{}`,
    `${"2".repeat(40)}\trefs/tags/v2.49.0-intelia.4`,
    `${"3".repeat(40)}\trefs/tags/v2.49.0-intelia.4^{}`,
    "",
  ].join("\n");

test("a commit that already carries an intelia tag is already released", () => {
  const sha = "a".repeat(40);
  // Annotated, matched through its peeled line.
  assert.equal(releasedTag(lsRemote(sha), sha), "v2.49.0-intelia.5");
  // Lightweight.
  assert.equal(
    releasedTag(`${sha}\trefs/tags/v2.48.0-intelia.18\n`, sha),
    "v2.48.0-intelia.18",
  );
  // Two tags on one commit: the highest.
  assert.equal(
    releasedTag(
      `${sha}\trefs/tags/v2.49.0-intelia.9\n${sha}\trefs/tags/v2.49.0-intelia.10\n`,
      sha,
    ),
    "v2.49.0-intelia.10",
  );
});

test("an untagged commit or a non-release tag is not released", () => {
  const sha = "a".repeat(40);
  assert.equal(releasedTag(lsRemote("b".repeat(40)), sha), null);
  assert.equal(releasedTag("", sha), null);
  assert.equal(releasedTag(`${sha}\trefs/tags/v2.49.0\n`, sha), null);
});
