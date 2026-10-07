import { count, sql } from 'drizzle-orm';
import type { Database } from '../../src/db/client.ts';
import { properties } from '../../src/db/schema.ts';

export async function resetDb(db: Database): Promise<void> {
  await db.execute(sql`TRUNCATE ${properties}`);
}

export async function countProperties(db: Database): Promise<number> {
  const [row] = await db.select({ n: count() }).from(properties);
  return row?.n ?? 0;
}
