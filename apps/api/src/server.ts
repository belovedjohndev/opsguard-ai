import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { AssessRequest, CreateRequest } from '@opsguard/application';
import { createOpenAIModelGateway } from '@opsguard/ai-core/openai';
import { resolveApiRuntimeConfig, resolveOpenAIRuntimeConfig } from '@opsguard/config';
import {
  createApplicationDatabaseConnection,
  DrizzleActiveMembershipResolver,
  DrizzleRequestAssessmentRepository,
  DrizzleRequestRepository,
  resolveApplicationDatabaseUrl,
} from '@opsguard/database';

import { buildApiApp } from './app.js';

export type StartedApiServer = Readonly<{
  app: ReturnType<typeof buildApiApp>;
  close: () => Promise<void>;
}>;

export const startApiServer = async (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<StartedApiServer> => {
  const runtimeConfig = resolveApiRuntimeConfig(environment);
  const openAIConfig = resolveOpenAIRuntimeConfig(environment);
  const databaseUrl = resolveApplicationDatabaseUrl(environment);
  const connection = createApplicationDatabaseConnection(databaseUrl);
  let app: ReturnType<typeof buildApiApp> | undefined;

  try {
    await connection.check();

    const requestAssessmentRepository = new DrizzleRequestAssessmentRepository(connection.database);
    const configuredApp = buildApiApp({
      activeMembershipResolver: new DrizzleActiveMembershipResolver(connection.database),
      assessRequest: new AssessRequest({
        clock: () => new Date(),
        modelConfiguration: {
          configurationKey: 'request.assessment.default',
          provider: 'openai',
          model: openAIConfig.modelId,
        },
        modelGateway: createOpenAIModelGateway({
          apiKey: openAIConfig.apiKey,
          modelId: openAIConfig.modelId,
        }),
        requestAssessmentRepository,
        timeoutMilliseconds: runtimeConfig.assessmentTimeoutMilliseconds,
      }),
      corsAllowedOrigins: runtimeConfig.corsAllowedOrigins,
      createRequest: new CreateRequest({
        clock: () => new Date(),
        generateRequestId: () => randomUUID(),
        requestRepository: new DrizzleRequestRepository(connection.database),
      }),
      logger: true,
    });
    app = configuredApp;

    await configuredApp.listen({ host: runtimeConfig.host, port: runtimeConfig.port });

    let closed = false;
    return Object.freeze({
      app: configuredApp,
      close: async () => {
        if (closed) {
          return;
        }

        closed = true;
        const results = await Promise.allSettled([configuredApp.close(), connection.close()]);
        if (results.some((result) => result.status === 'rejected')) {
          throw new Error('API shutdown failed.');
        }
      },
    });
  } catch (error) {
    await Promise.allSettled([app?.close() ?? Promise.resolve(), connection.close()]);
    throw error;
  }
};

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  void startApiServer()
    .then((server) => {
      const shutdown = (): void => {
        void server
          .close()
          .then(() => {
            process.exitCode = 0;
          })
          .catch(() => {
            process.exitCode = 1;
          });
      };

      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    })
    .catch(() => {
      console.error('API startup failed.');
      process.exitCode = 1;
    });
}
