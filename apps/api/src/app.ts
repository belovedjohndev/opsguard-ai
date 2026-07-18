import { randomUUID } from 'node:crypto';

import Fastify from 'fastify';

export type BuildApiAppOptions = Readonly<{
  generateRequestId?: () => string;
  logger?: boolean;
}>;

export const buildApiApp = (options: BuildApiAppOptions = {}) => {
  const generateRequestId = options.generateRequestId ?? randomUUID;
  const app = Fastify({
    genReqId: () => generateRequestId(),
    logger: options.logger ?? false,
    requestIdHeader: false,
  });

  app.addHook('onRequest', (request, reply, done) => {
    void reply.header('x-request-id', request.id);
    done();
  });

  app.get('/health', async () => ({ status: 'ok' as const }));

  return app;
};
