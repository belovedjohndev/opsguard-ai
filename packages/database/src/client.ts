import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema/index.js';

export type OpsGuardDatabase = NodePgDatabase<typeof schema>;

export type ApplicationDatabaseConnection = Readonly<{
  database: OpsGuardDatabase;
  check: () => Promise<void>;
  close: () => Promise<void>;
}>;

export const createApplicationDatabaseConnection = (
  connectionString: string,
): ApplicationDatabaseConnection => {
  const pool = new Pool({
    application_name: 'opsguard-api',
    connectionString,
    max: 10,
  });

  return Object.freeze({
    database: drizzle(pool, { schema }),
    check: async () => {
      await pool.query('SELECT 1');
    },
    close: async () => {
      await pool.end();
    },
  });
};
