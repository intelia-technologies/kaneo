import { Client } from "pg";

// Intelia fork (design 21 §4.9 in software-factory). Runs once, before any test
// file loads: if it throws, no test, hook, migration or DROP runs. DATABASE_URL
// must point at the throwaway server that scripts/ci/intelia-test-integration.sh
// started and marked with the NOLOGIN role named in KANEO_TEST_MARK. Any other
// server is rejected, also when DATABASE_URL is set explicitly: creating and
// dropping a database on someone else's server is not having one of our own.
const runWith =
  "run the integration tests with scripts/ci/intelia-test-integration.sh";

// Stack frames dropped on purpose: vitest 5.0.5 crashes while source-mapping a
// globalSetup error's stack ("code.charCodeAt is not a function") and the
// message is lost.
function refuse(message: string): never {
  const error = new Error(`${message}: ${runWith}`);
  error.stack = `Error: ${error.message}`;
  throw error;
}

export default async function checkThrowawayServer() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const mark = process.env.KANEO_TEST_MARK?.trim();
  if (!databaseUrl || !mark) {
    refuse("Integration tests need DATABASE_URL and KANEO_TEST_MARK");
  }
  if (!/^sft_[a-z0-9]+$/.test(mark)) {
    refuse(`KANEO_TEST_MARK "${mark}" is not sft_<id>`);
  }

  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!databaseName.endsWith("_test")) {
    refuse(
      `DATABASE_URL must use a database name ending in _test (got "${databaseName}")`,
    );
  }

  const serverUrl = new URL(databaseUrl);
  serverUrl.pathname = "/postgres";
  const client = new Client({ connectionString: serverUrl.toString() });
  await client
    .connect()
    .catch((error: unknown) =>
      refuse(`Could not reach the server in DATABASE_URL (${String(error)})`),
    );
  try {
    const marked = await client.query(
      "SELECT 1 FROM pg_roles WHERE rolname = $1",
      [mark],
    );
    if (marked.rowCount !== 1) {
      refuse(
        `The server in DATABASE_URL has no role ${mark}, so it is not this run's throwaway server`,
      );
    }
  } finally {
    await client.end();
  }
}
