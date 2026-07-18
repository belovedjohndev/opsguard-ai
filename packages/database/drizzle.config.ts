import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnvironment } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

import { resolveApplicationDatabaseUrl } from './src/database-url.js';

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));

loadEnvironment({
  path: path.resolve(packageDirectory, '../../.env'),
  quiet: true,
});

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: resolveApplicationDatabaseUrl(process.env),
  },
  migrations: {
    prefix: 'index',
    schema: 'drizzle',
    table: '__drizzle_migrations',
  },
  strict: true,
  verbose: true,
});
