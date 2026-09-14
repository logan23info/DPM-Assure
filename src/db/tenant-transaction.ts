import "server-only";

import type { PoolClient } from "pg";

import { databaseForClient, getPool, type AppDatabase } from "./runtime";

export interface TenantExecutionContext {
  readonly userId: string;
  readonly organizationId: string;
  readonly requestId: string;
}

export interface TenantTransaction {
  readonly db: AppDatabase;
  readonly client: PoolClient;
  readonly context: TenantExecutionContext;
}

export async function withTenantTransaction<T>(
  context: TenantExecutionContext,
  work: (transaction: TenantTransaction) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `SELECT
         set_config('app.user_id', $1, true),
         set_config('app.organization_id', $2, true),
         set_config('app.request_id', $3, true)`,
      [context.userId, context.organizationId, context.requestId],
    );

    const result = await work({
      db: databaseForClient(client),
      client,
      context,
    });

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
