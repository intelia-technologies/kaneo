#!/usr/bin/env bash
# Intelia fork (README-INTELIA.md): TruffleHog scan that fails only on findings
# missing from intelia-secret-baseline.tsv (known upstream false positives).
#
# Usage: intelia-secret-scan.sh <head-sha> [since-commit]
#   Without since-commit it scans the whole history reachable from head.
#   TRUFFLEHOG=<path> skips the download (local runs).
set -euo pipefail

head="$1"
since="${2:-}"
baseline="$(dirname "$0")/intelia-secret-baseline.tsv"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

trufflehog="${TRUFFLEHOG:-}"
if [ -z "$trufflehog" ]; then
  curl --fail --silent --show-error --location --max-time 120 \
    https://github.com/trufflesecurity/trufflehog/releases/download/v3.97.9/trufflehog_3.97.9_linux_amd64.tar.gz \
    -o "$work/trufflehog.tar.gz"
  echo "40377e6572495412fb9ba0bc21c9401f73b72f1d2afd11b9931bc4a5ed622866  $work/trufflehog.tar.gz" | sha256sum --check --strict
  tar -xzf "$work/trufflehog.tar.gz" -C "$work" trufflehog
  trufflehog="$work/trufflehog"
fi

args=(git "file://$PWD" --branch "$head" "--results=verified,unknown"
  --exclude-paths=.trufflehog-exclude --no-update --json)
if [ -n "$since" ]; then
  args+=(--since-commit "$since")
fi
"$trufflehog" "${args[@]}" > "$work/findings.jsonl"

# Fingerprint: detector, commit, file and line. Never the secret value.
jq -r '[.DetectorName, .SourceMetadata.Data.Git.commit, .SourceMetadata.Data.Git.file, (.SourceMetadata.Data.Git.line | tostring)] | @tsv' \
  "$work/findings.jsonl" | sort -u > "$work/found.tsv"
grep -v '^#' "$baseline" | cut -f1-4 | sort -u > "$work/known.tsv"
comm -23 "$work/found.tsv" "$work/known.tsv" > "$work/new.tsv"

found="$(wc -l < "$work/found.tsv")"
new="$(wc -l < "$work/new.tsv")"
{
  echo "### Secret scan (${since:+since ${since:0:12}, }head ${head:0:12})"
  echo "TruffleHog findings: $found; new (not in the baseline): $new."
  if [ "$new" -ne 0 ]; then
    echo
    echo "| Detector | Commit | File | Line |"
    echo "|---|---|---|---|"
    while IFS=$'\t' read -r detector commit file line; do
      echo "| $detector | ${commit:0:12} | \`$file\` | $line |"
    done < "$work/new.tsv"
    echo
    echo "Rotate any real credential. A reviewed false positive goes to \`scripts/ci/intelia-secret-baseline.tsv\`."
  fi
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"

while IFS=$'\t' read -r detector commit file line; do
  echo "::error file=$file,line=$line::$detector finding in ${commit:0:12} missing from the secret-scan baseline"
done < "$work/new.tsv"
[ "$new" -eq 0 ]
