import { config } from "dotenv-mono";
import { type Config, defineConfig } from "drizzle-kit";
import { resolveDatabaseConnectionString } from "./src/database/resolve-database-url";
import { INTELIA_MIGRATIONS_TABLE } from "./src/intelia/migrate";
import { INTELIA_SCHEMA } from "./src/intelia/schema";

config();

// Intelia fork: own schema, own journal, own migrations table. Never point
// this at ./drizzle (upstream's journal). See README-INTELIA.md.
export default defineConfig({
  out: "./drizzle-intelia",
  schema: "./src/intelia/schema.ts",
  schemaFilter: [INTELIA_SCHEMA],
  dialect: "postgresql",
  migrations: {
    schema: INTELIA_SCHEMA,
    table: INTELIA_MIGRATIONS_TABLE,
  },
  dbCredentials: {
    url: resolveDatabaseConnectionString(),
  },
}) satisfies Config;
