import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const web = (p: string) => path.resolve(__dirname, p);

// Web tests against the real API (Intelia fork): the Hono app in-process over
// a throwaway PostgreSQL, so only through scripts/ci/intelia-test-integration.sh
// (tests/api-integration/global-setup.ts refuses any other database). The root
// is the API's: the shared helpers in tests/api-integration import its
// dependencies (pg, drizzle-orm), which resolve from there.
export default defineConfig({
  root: web("../api"),
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: [web("src/**/*.integration.test.{ts,tsx}")],
    globalSetup: [web("../../tests/api-integration/global-setup.ts")],
    setupFiles: [
      web("../../tests/api-integration/setup.ts"),
      web("src/test/setup.ts"),
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    hookTimeout: 60_000,
    testTimeout: 60_000,
    coverage: {
      enabled: false,
    },
  },
  resolve: {
    alias: {
      "@": web("src"),
      "@i18n": web("../../i18n"),
      "@kaneo/email": web("../../tests/api-integration/mocks/email.ts"),
    },
    // Imported bare by the helpers in tests/api-integration: from the root.
    dedupe: ["drizzle-orm", "pg"],
  },
});
