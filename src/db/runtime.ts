import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";

import * as schema from "./schema";

let pool: Pool | undefined;

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;

  if (!value) {
    throw new Error("DATABASE_URL is required for database access");
  }

  return value;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: requireDatabaseUrl(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return pool;
}

export type AppDatabase = NodePgDatabase<typeof schema>;

export function databaseForClient(client: PoolClient): AppDatabase {
  return drizzle(client, { schema });
}

export function getDatabase(): AppDatabase {
  return drizzle(getPool(), { schema });
}
