# API integration tests

These tests boot the Hono app with a real PostgreSQL database.

- Run: `scripts/ci/intelia-test-integration.sh` from the repo root. It starts a throwaway, marked PostgreSQL container and runs `pnpm test:integration` against it; `setup.ts` rejects any other `DATABASE_URL` (Intelia fork, see `README-INTELIA.md`, «Tests de integración»).
- CI: `.github/workflows/intelia-integration.yml` runs the same script.

Coverage is intentionally incremental: add new files under this directory for additional routes or behaviors, following existing helpers (`helpers/fixtures.ts`, `helpers/database.ts`, `helpers/auth.ts`).
