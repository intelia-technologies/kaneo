#!/usr/bin/env bash
# Intelia fork (design 21 §4.9 in software-factory): the only way to run the API
# integration tests. Starts a throwaway PostgreSQL container of its own on a
# random loopback port, marks the server with a NOLOGIN role sft_<id>, runs the
# command with only that server's DATABASE_URL and the mark, and removes the
# container and its volume on exit. tests/api-integration/setup.ts refuses any
# DATABASE_URL whose server lacks the mark.
#
#   scripts/ci/intelia-test-integration.sh                # pnpm test:integration
#   scripts/ci/intelia-test-integration.sh -- <command>   # any other command
#
# Exit codes: the command's own, or 3 if cleanup could not be confirmed.
set -euo pipefail

if [[ "${1:-}" == "--" ]]; then
  shift
fi
if [[ $# -eq 0 ]]; then
  set -- pnpm test:integration
fi

image="${KANEO_TEST_POSTGRES_IMAGE:-postgres:16}"
id="$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
mark="sft_${id}"
container="kaneo-test-pg-${id}"
password="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
database="kaneo_test"

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  docker exec "$container" psql -q -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS ${database} WITH (FORCE)" >/dev/null 2>&1 || true
  docker rm -f -v "$container" >/dev/null 2>&1 || true
  if [[ -n "$(docker ps -aq --filter "label=sf.test.invocacion=${id}")" ]]; then
    echo "limpieza no confirmada: ${container}" >&2
    exit 3
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker run -d --name "$container" \
  --label "sf.test.invocacion=${id}" \
  --label "sf.test.modo=run" \
  --label "sf.test.worktree=${PWD}" \
  --label "sf.test.pid=$$" \
  --label "sf.test.creado=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD="$password" \
  -e POSTGRES_DB="$database" \
  -p 127.0.0.1::5432 \
  "$image" >/dev/null

# The image's init phase listens on the Unix socket only; TCP answers once the
# final server is up.
for _ in $(seq 1 60); do
  if docker exec "$container" pg_isready -q -h 127.0.0.1 -U postgres -d "$database"; then
    break
  fi
  sleep 1
done
docker exec "$container" pg_isready -q -h 127.0.0.1 -U postgres -d "$database"

port="$(docker port "$container" 5432/tcp | sed -n 's/^127\.0\.0\.1:\([0-9]*\)$/\1/p')"
if [[ -z "$port" ]]; then
  echo "no loopback port published for ${container}" >&2
  exit 1
fi

docker exec "$container" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "CREATE ROLE ${mark} NOLOGIN"

echo "integration tests on ${container} (127.0.0.1:${port}, mark ${mark})" >&2
status=0
DATABASE_URL="postgresql://postgres:${password}@127.0.0.1:${port}/${database}" \
  KANEO_TEST_MARK="$mark" \
  "$@" || status=$?
exit "$status"
