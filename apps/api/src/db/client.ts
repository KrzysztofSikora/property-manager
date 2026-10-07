import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export type Database = NodePgDatabase;

export type DbHandle = { db: Database; close: () => Promise<void> };

export function createDb(databaseUrl: string): DbHandle {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  return {
    db: drizzle({ client: pool }),
    close: () => pool.end(),
  };
}
