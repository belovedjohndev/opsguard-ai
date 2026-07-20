import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { config as loadEnvironment } from 'dotenv';

import { createApplicationDatabaseConnection } from './client.js';
import { resolveApplicationDatabaseUrl } from './database-url.js';
import { tenantMemberships, tenants, users } from './schema/index.js';

export const demoSeed = Object.freeze({
  tenant: Object.freeze({
    id: '8f7e6d5c-4b3a-4210-9fed-cba987654321',
    slug: 'opsguard-hackathon-demo',
    name: 'OpsGuard Synthetic Demo',
  }),
  user: Object.freeze({
    id: '719e2bb4-0a4e-4f04-9fd1-d7261ed71f11',
    email: 'operator@opsguard-demo.example.test',
  }),
  membership: Object.freeze({
    id: 'b3294a61-3ef0-46c4-9231-773ba0f39f67',
    role: 'operator' as const,
  }),
});

export type DemoSeedDatabase = Pick<
  ReturnType<typeof createApplicationDatabaseConnection>['database'],
  'transaction'
>;

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const seedDemoTenant = async (database: DemoSeedDatabase): Promise<void> => {
  await database.transaction(async (transaction) => {
    await transaction
      .insert(tenants)
      .values({
        id: demoSeed.tenant.id,
        slug: demoSeed.tenant.slug,
        name: demoSeed.tenant.name,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: tenants.id,
        set: {
          slug: demoSeed.tenant.slug,
          name: demoSeed.tenant.name,
          status: 'active',
          updatedAt: new Date(),
        },
      });

    await transaction
      .insert(users)
      .values({
        id: demoSeed.user.id,
        email: demoSeed.user.email,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: demoSeed.user.email,
          updatedAt: new Date(),
        },
      });

    await transaction
      .insert(tenantMemberships)
      .values({
        id: demoSeed.membership.id,
        tenantId: demoSeed.tenant.id,
        userId: demoSeed.user.id,
        role: demoSeed.membership.role,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: tenantMemberships.id,
        set: {
          tenantId: demoSeed.tenant.id,
          userId: demoSeed.user.id,
          role: demoSeed.membership.role,
          status: 'active',
          updatedAt: new Date(),
        },
      });
  });
};

const run = async (): Promise<void> => {
  loadEnvironment({ path: path.resolve(packageDirectory, '../../.env'), quiet: true });
  const connection = createApplicationDatabaseConnection(
    resolveApplicationDatabaseUrl(process.env),
  );

  try {
    await connection.check();
    await seedDemoTenant(connection.database);
    console.log('Synthetic demo tenant is ready.');
  } finally {
    await connection.close();
  }
};

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  void run().catch(() => {
    console.error('Synthetic demo seed failed.');
    process.exitCode = 1;
  });
}
