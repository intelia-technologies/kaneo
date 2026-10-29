import { pgSchema } from "drizzle-orm/pg-core";

// Intelia fork: our tables live in their own PostgreSQL schema, never in
// upstream's. See README-INTELIA.md («Base de datos»).
export const INTELIA_SCHEMA = "intelia";

export const inteliaSchema = pgSchema(INTELIA_SCHEMA);
